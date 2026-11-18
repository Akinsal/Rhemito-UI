import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Home, Loader2, Trash2, Wifi } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getSendMoneyTransactions } from "@/lib/sendMoney";
import { welcomeName } from "@/lib/userDisplay";
import { cn } from "@/lib/utils";
import {
  COLLECTION_CURRENCY_ACCOUNTS,
  WALLET_CURRENCY_ACCOUNTS,
  DEMO_GBP_TOTAL_SENT,
  formatAccountAmount,
  type CollectionCurrencyAccount,
  type WalletCurrencyAccount,
} from "@/data/collectionAccounts";
import {
  getPayoutAccounts,
  addPayoutAccount,
  deletePayoutAccount,
  setDefaultPayoutAccount,
  type PayoutAccountView,
} from "@/lib/requests";

type SettingsTab = "profile" | "accounts" | "password" | "cards" | "banks";

const DEFAULT_TIMEZONE = "GMT · UTC+0 · London — UK, Ireland, Iceland";
const TIMEZONE_STORAGE_KEY = "rhemito_display_timezone";

const TIMEZONE_OPTIONS: string[] = [
  DEFAULT_TIMEZONE,
  "CET · UTC+1 · Berlin, Paris",
  "WAT · UTC+1 · Lagos",
  "EAT · UTC+3 · Nairobi",
  "GST · UTC+4 · Dubai",
  "IST · UTC+5:30 · Mumbai",
  "EST · UTC-5 · New York",
  "PST · UTC-8 · Los Angeles",
];

const COUNTRY_NAME_MAP: Record<string, string> = {
  GB: "UK",
  US: "USA",
  NG: "Nigeria",
  CA: "Canada",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  KE: "Kenya",
  GH: "Ghana",
  IN: "India",
  AE: "United Arab Emirates",
  ZA: "South Africa",
  AU: "Australia",
};

const ISO2_TO_ISO3: Record<string, string> = {
  GB: "GBR",
  US: "USA",
  NG: "NGA",
  CA: "CAN",
  IE: "IRL",
  DE: "DEU",
  FR: "FRA",
  KE: "KEN",
  GH: "GHA",
  IN: "IND",
  AE: "ARE",
  ZA: "ZAF",
  AU: "AUS",
};

const BANK_CORRIDOR_OPTIONS: Array<{
  country: string;
  currency: string;
  label: string;
  routingLabel?: string;
  routingRequired?: boolean;
  routingPlaceholder?: string;
}> = [
  {
    country: "GB",
    currency: "GBP",
    label: "UK — GBP (British Pounds)",
    routingLabel: "Sort code",
    routingRequired: true,
    routingPlaceholder: "e.g. 20-45-67",
  },
  {
    country: "US",
    currency: "USD",
    label: "USA — USD (US Dollars)",
    routingLabel: "ABA routing number",
    routingRequired: true,
    routingPlaceholder: "9-digit routing number",
  },
  {
    country: "NG",
    currency: "NGN",
    label: "Nigeria — NGN (Naira)",
  },
  {
    country: "CA",
    currency: "CAD",
    label: "Canada — CAD",
    routingLabel: "Transit / institution code",
    routingRequired: false,
    routingPlaceholder: "Optional transit & institution code",
  },
  {
    country: "DE",
    currency: "EUR",
    label: "Eurozone — EUR",
    routingLabel: "BIC / SWIFT",
    routingRequired: false,
    routingPlaceholder: "Optional BIC / SWIFT code",
  },
];

interface SavedPaymentCard {
  id: string;
  scheme: "visa" | "mastercard";
  last4: string;
  expiry: string;
}

const DEFAULT_SAVED_CARDS: SavedPaymentCard[] = [
  { id: "card_visa_4242", scheme: "visa", last4: "4242", expiry: "09/28" },
  { id: "card_mc_4182", scheme: "mastercard", last4: "4182", expiry: "11/27" },
  { id: "card_visa_1342", scheme: "visa", last4: "1342", expiry: "04/29" },
];

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDobDisplay(dob: string | null | undefined): string {
  if (!dob) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) return dob;
  const year = match[1];
  const monthIdx = Number(match[2]) - 1;
  const day = match[3];
  if (monthIdx < 0 || monthIdx > 11) return dob;
  return `${day} ${MONTHS_SHORT[monthIdx]} ${year}`;
}

function deriveFullName(account: AuthUser | null): string {
  if (!account) return "";
  if (account.accountType === "business" && account.businessName?.trim()) {
    return account.businessName.trim();
  }
  const joined = [account.firstName, account.middleName, account.lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return joined || welcomeName(account);
}

function deriveAddressDisplay(account: AuthUser | null): string {
  if (!account) return "—";
  const streetLine = [account.buildingNumber, account.street]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const segments = [
    account.buildingName,
    account.subStreet,
    streetLine,
    account.addressCity,
    account.addressPostcode,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  if (segments.length > 0) {
    return segments.join(", ");
  }
  return "1 Sheldon Square, London, W2 6TT";
}

function deriveAccountNumber(userId: string | undefined): string {
  if (!userId || userId === "user_123") return "235324";
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const sixDigit = 100000 + (hash % 900000);
  return String(sixDigit);
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { user, demoUser, isLoading: isAuthLoading } = useAuth();
  const activeUser = user ?? demoUser;
  const { toast } = useToast();

  const activeTab: SettingsTab = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get("tab")?.toLowerCase();
    if (
      raw === "accounts" ||
      raw === "password" ||
      raw === "cards" ||
      raw === "banks" ||
      raw === "profile"
    ) {
      return raw;
    }
    return "profile";
  }, [searchString]);

  const handleSelectTab = (tab: SettingsTab) => {
    if (tab === "profile") {
      setLocation("/settings");
    } else {
      setLocation(`/settings?tab=${tab}`);
    }
  };

  // ── Tab 1: Edit profile state ───────────────────────────────────────────────
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
      if (saved && TIMEZONE_OPTIONS.includes(saved)) return saved;
    } catch {
      // ignore storage errors
    }
    return DEFAULT_TIMEZONE;
  });

  const [changeRequestField, setChangeRequestField] = useState<{
    label: string;
    currentValue: string;
  } | null>(null);
  const [changeReason, setChangeReason] = useState<string>("");

  const handleTimezoneChange = (nextTz: string) => {
    setTimezone(nextTz);
    try {
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, nextTz);
    } catch {
      // ignore storage errors
    }
    toast({
      title: "Display timezone updated",
      description: `Timestamps will now display in ${nextTz.split("·")[0]?.trim() ?? nextTz}.`,
    });
  };

  const handleResetTimezone = () => {
    setTimezone(DEFAULT_TIMEZONE);
    try {
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, DEFAULT_TIMEZONE);
    } catch {
      // ignore storage errors
    }
    toast({
      title: "Display timezone reset",
      description: `Restored default display timezone (${DEFAULT_TIMEZONE}).`,
    });
  };

  const handleSubmitProfileChangeRequest = () => {
    const trimmed = changeReason.trim();
    if (!trimmed) {
      toast({
        title: "Reason required",
        description: "Please describe what needs to change so compliance can verify it.",
        variant: "destructive",
      });
      return;
    }
    const fieldLabel = changeRequestField?.label ?? "Profile detail";
    setChangeRequestField(null);
    setChangeReason("");
    toast({
      title: "Change request submitted",
      description: `Our compliance team received your request to update ${fieldLabel.toLowerCase()}.`,
    });
  };

  const profileRows = useMemo(() => {
    const fullName = deriveFullName(activeUser) || "—";
    const email = activeUser?.email?.trim() || "—";
    const mobileJoined = `${activeUser?.mobileCode ?? ""}${activeUser?.mobileNumber ?? ""}`.trim();
    const countryIso = (activeUser?.addressCountry || activeUser?.country || "").toUpperCase();
    const countryLabel = countryIso ? COUNTRY_NAME_MAP[countryIso] ?? countryIso : "—";
    const dobLabel = formatDobDisplay(activeUser?.dateOfBirth);
    const addressLabel = deriveAddressDisplay(activeUser);

    return [
      { key: "full-name", label: "Full name", value: fullName },
      { key: "email", label: "Email", value: email },
      { key: "mobile", label: "Mobile number", value: mobileJoined || "—" },
      { key: "country", label: "Country of residence", value: countryLabel },
      { key: "dob", label: "Date of birth", value: dobLabel },
      { key: "address", label: "Address", value: addressLabel },
    ];
  }, [activeUser]);

  // ── Tab 2: Accounts summary state ───────────────────────────────────────────
  const isDemoUser = !isAuthLoading && (!user || user.id === "user_123");
  const accountNumber = useMemo(
    () => deriveAccountNumber(activeUser?.id),
    [activeUser?.id]
  );

  const [topSentCurrency, setTopSentCurrency] = useState<"GBP" | "USD" | "NGN">("GBP");
  const [walletCurrency, setWalletCurrency] = useState<WalletCurrencyAccount["code"]>("GBP");
  const [paymentCurrency, setPaymentCurrency] =
    useState<CollectionCurrencyAccount["code"]>("GBP");

  const sendMoneyQuery = useQuery({
    queryKey: ["/api/send-money/transactions", user?.id ?? "demo"],
    queryFn: getSendMoneyTransactions,
    enabled: !isAuthLoading,
  });

  const completedSendMoneyTxs = useMemo(
    () => (sendMoneyQuery.data ?? []).filter((tx) => tx.status === "completed"),
    [sendMoneyQuery.data]
  );

  const topAmountSentFormatted = useMemo(() => {
    if (isDemoUser && topSentCurrency === "GBP") {
      return formatAccountAmount(DEMO_GBP_TOTAL_SENT);
    }
    const matchingSum = completedSendMoneyTxs
      .filter((tx) => (tx.sendCurrency || "GBP").toUpperCase() === topSentCurrency)
      .reduce((sum, tx) => sum + Number(tx.sendAmount || 0), 0);
    return formatAccountAmount(matchingSum);
  }, [isDemoUser, topSentCurrency, completedSendMoneyTxs]);

  const walletAmountSentFormatted = useMemo(() => {
    const selectedWallet =
      WALLET_CURRENCY_ACCOUNTS.find((acct) => acct.code === walletCurrency) ??
      WALLET_CURRENCY_ACCOUNTS[0];
    if (isDemoUser) {
      return formatAccountAmount(selectedWallet.demoAmountSent);
    }
    const matchingSum = completedSendMoneyTxs
      .filter((tx) => (tx.sendCurrency || "GBP").toUpperCase() === selectedWallet.code)
      .reduce((sum, tx) => sum + Number(tx.sendAmount || 0), 0);
    return formatAccountAmount(matchingSum);
  }, [isDemoUser, walletCurrency, completedSendMoneyTxs]);

  const paymentAccountFormatted = useMemo(() => {
    const selectedCollection =
      COLLECTION_CURRENCY_ACCOUNTS.find((acct) => acct.code === paymentCurrency) ??
      COLLECTION_CURRENCY_ACCOUNTS[0];
    if (isDemoUser) {
      return formatAccountAmount(selectedCollection.demoBalance);
    }
    return "0.00";
  }, [isDemoUser, paymentCurrency]);

  // ── Tab 3: Change password state ────────────────────────────────────────────
  const [existingPassword, setExistingPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [showExistingPassword, setShowExistingPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!existingPassword || !newPassword || !confirmNewPassword) {
      toast({
        title: "Missing password fields",
        description: "Please enter your existing password, new password, and confirmation.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "New password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword === existingPassword) {
      toast({
        title: "Choose a different password",
        description: "New password must be different from your existing password.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({
        title: "Passwords do not match",
        description: "New password and confirmation password must match.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        existingPassword,
        newPassword,
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      setExistingPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowExistingPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast({
        title: "Password updated",
        description: json?.message ?? "Your password has been updated successfully.",
      });
    } catch (err) {
      toast({
        title: "Unable to change password",
        description: err instanceof Error ? err.message : "Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── Tab 4: My cards state ───────────────────────────────────────────────────
  const cardsStorageKey = `rhemito_saved_cards_${activeUser?.id ?? "demo"}`;
  const [savedCards, setSavedCards] = useState<SavedPaymentCard[]>(DEFAULT_SAVED_CARDS);
  const [cardPendingRemoval, setCardPendingRemoval] = useState<SavedPaymentCard | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cardsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedPaymentCard[];
        if (Array.isArray(parsed)) {
          setSavedCards(parsed);
          return;
        }
      }
      window.localStorage.setItem(cardsStorageKey, JSON.stringify(DEFAULT_SAVED_CARDS));
      setSavedCards(DEFAULT_SAVED_CARDS);
    } catch {
      setSavedCards(DEFAULT_SAVED_CARDS);
    }
  }, [cardsStorageKey]);

  const cardholderName = useMemo(() => {
    const derived = deriveFullName(activeUser);
    return (derived || "VERIFIED CARDHOLDER").toUpperCase();
  }, [activeUser]);

  const handleConfirmRemoveCard = () => {
    if (!cardPendingRemoval) return;
    const removed = cardPendingRemoval;
    const updated = savedCards.filter((c) => c.id !== removed.id);
    setSavedCards(updated);
    try {
      window.localStorage.setItem(cardsStorageKey, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
    setCardPendingRemoval(null);
    toast({
      title: "Card removed",
      description: `${removed.scheme === "visa" ? "Visa" : "Mastercard"} ending in ${removed.last4} was removed.`,
    });
  };

  // ── Tab 5: My bank accounts state ───────────────────────────────────────────
  const payoutAccountsQuery = useQuery({
    queryKey: ["/api/request-money/payout-accounts"],
    queryFn: getPayoutAccounts,
    enabled: !isAuthLoading,
  });

  const [isAddBankOpen, setIsAddBankOpen] = useState<boolean>(false);
  const [bankCountry, setBankCountry] = useState<string>("GB");
  const [bankNameInput, setBankNameInput] = useState<string>("");
  const [bankAccountInput, setBankAccountInput] = useState<string>("");
  const [bankRoutingInput, setBankRoutingInput] = useState<string>("");
  const [isAddingBank, setIsAddingBank] = useState<boolean>(false);

  const [bankPendingRemoval, setBankPendingRemoval] = useState<PayoutAccountView | null>(null);
  const [isRemovingBank, setIsRemovingBank] = useState<boolean>(false);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);

  const activeBankCorridor = useMemo(
    () =>
      BANK_CORRIDOR_OPTIONS.find((opt) => opt.country === bankCountry) ??
      BANK_CORRIDOR_OPTIONS[0],
    [bankCountry]
  );

  const resetAddBankForm = () => {
    setBankCountry("GB");
    setBankNameInput("");
    setBankAccountInput("");
    setBankRoutingInput("");
  };

  const handleAddBankSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedBank = bankNameInput.trim();
    const trimmedAcc = bankAccountInput.trim();
    const trimmedRouting = bankRoutingInput.trim();

    if (!trimmedBank || trimmedBank.length < 2) {
      toast({
        title: "Bank name required",
        description: "Please enter the name of your bank.",
        variant: "destructive",
      });
      return;
    }
    if (!trimmedAcc || trimmedAcc.length < 4) {
      toast({
        title: "Account number required",
        description: "Please enter a valid account number or IBAN.",
        variant: "destructive",
      });
      return;
    }
    if (activeBankCorridor.routingRequired && !trimmedRouting) {
      toast({
        title: `${activeBankCorridor.routingLabel ?? "Routing code"} required`,
        description: `Please enter your ${activeBankCorridor.routingLabel?.toLowerCase() ?? "routing code"}.`,
        variant: "destructive",
      });
      return;
    }

    setIsAddingBank(true);
    try {
      await addPayoutAccount({
        holderName: deriveFullName(activeUser) || "Verified Account Holder",
        country: activeBankCorridor.country,
        currency: activeBankCorridor.currency,
        bankName: trimmedBank,
        accountNumber: trimmedAcc,
        routingNumber: trimmedRouting || undefined,
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/request-money/payout-accounts"],
      });
      setIsAddBankOpen(false);
      resetAddBankForm();
      toast({
        title: "Bank account added",
        description: `${trimmedBank} (${activeBankCorridor.currency}) was added to your payout accounts.`,
      });
    } catch (err) {
      toast({
        title: "Unable to add bank account",
        description: err instanceof Error ? err.message : "Please verify the account details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsAddingBank(false);
    }
  };

  const handleSetPrimary = async (accountId: string) => {
    setSettingPrimaryId(accountId);
    try {
      await setDefaultPayoutAccount(accountId);
      await queryClient.invalidateQueries({
        queryKey: ["/api/request-money/payout-accounts"],
      });
      toast({
        title: "Primary bank account updated",
        description: "Incoming Receive money, invoice, and campaign payouts will settle to this account.",
      });
    } catch (err) {
      toast({
        title: "Unable to update primary account",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleConfirmRemoveBank = async () => {
    if (!bankPendingRemoval) return;
    const target = bankPendingRemoval;
    setIsRemovingBank(true);
    try {
      await deletePayoutAccount(target.id);
      await queryClient.invalidateQueries({
        queryKey: ["/api/request-money/payout-accounts"],
      });
      setBankPendingRemoval(null);
      toast({
        title: "Bank account removed",
        description: `${target.bankName} (${target.maskedNumber}) was removed.`,
      });
    } catch (err) {
      toast({
        title: "Unable to remove bank account",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRemovingBank(false);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; testId: string }> = [
    { id: "profile", label: "Edit profile", testId: "tab-settings-profile" },
    { id: "accounts", label: "Accounts", testId: "tab-settings-accounts" },
    { id: "password", label: "Change password", testId: "tab-settings-password" },
    { id: "cards", label: "My cards", testId: "tab-settings-cards" },
    { id: "banks", label: "My bank accounts", testId: "tab-settings-banks" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">
        <div>
          <h1
            data-testid="heading-settings"
            className="text-2xl md:text-[28px] font-normal text-[#323130] tracking-tight"
          >
            Settings
          </h1>

          <div
            role="tablist"
            aria-label="Settings sections"
            className="mt-5 flex items-center gap-6 overflow-x-auto border-b border-slate-100"
          >
            {tabs.map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={tab.testId}
                  onClick={() => handleSelectTab(tab.id)}
                  className={cn(
                    "pb-3 text-sm whitespace-nowrap transition-colors cursor-pointer border-b-2 -mb-px focus-visible:outline-none",
                    isSelected
                      ? "border-[#2e5bff] font-medium text-[#323130]"
                      : "border-transparent font-normal text-[#605e5c] hover:text-[#323130]"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab 1: Edit profile ────────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div data-testid="panel-settings-profile" className="space-y-8 pt-1">
            <div>
              <h2 className="text-sm font-medium text-[#323130]">
                Display timezone
              </h2>
              <div className="mt-2 flex items-center gap-2.5">
                <Select value={timezone} onValueChange={handleTimezoneChange}>
                  <SelectTrigger
                    data-testid="select-display-timezone"
                    className="w-full max-w-md h-10 bg-white border-slate-200 text-sm text-[#323130]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  data-testid="button-reset-timezone"
                  onClick={handleResetTimezone}
                  aria-label="Reset display timezone"
                  title="Reset to default timezone"
                  className="h-10 w-10 shrink-0 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Home className="h-4 w-4 text-[#2e5bff]" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-[#605e5c]">
                MITO transactions stay on UTC. This only changes what you see.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#323130]">
                Profile details
              </h2>
              <p className="mt-1 text-xs text-[#605e5c]">
                These stay locked to your verified record. Ask us if something must change.
              </p>

              <div className="mt-4 max-w-2xl divide-y divide-slate-100 border-y border-slate-100">
                {profileRows.map((row) => (
                  <div
                    key={row.key}
                    data-testid={`profile-row-${row.key}`}
                    className="py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-4 items-baseline">
                      <span className="text-xs font-normal text-[#605e5c]">
                        {row.label}
                      </span>
                      <span
                        data-testid={`profile-value-${row.key}`}
                        className="text-sm font-normal text-[#323130] break-words"
                      >
                        {row.value}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={`button-request-change-${row.key}`}
                      onClick={() => {
                        setChangeRequestField({
                          label: row.label,
                          currentValue: row.value,
                        });
                        setChangeReason("");
                      }}
                      className="text-xs font-medium text-[#2e5bff] hover:underline cursor-pointer shrink-0"
                    >
                      Request change
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 2: Accounts ────────────────────────────────────────────────── */}
        {activeTab === "accounts" && (
          <div data-testid="panel-settings-accounts" className="pt-1">
            <h2 className="text-lg font-normal text-[#323130] mb-4">
              Account summary
            </h2>

            <div className="rounded-md border border-[#e8e8e8] bg-white px-6 py-5 shadow-2xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-[#605e5c]">Account number</span>
                <span
                  data-testid="settings-account-number"
                  className="text-base font-normal text-[#323130] tabular-nums"
                >
                  {accountNumber}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-[#323130]">
                  Amount sent
                </span>
                <div className="flex items-center gap-3">
                  <span
                    data-testid="settings-total-amount-sent"
                    className="text-sm font-medium text-[#2e5bff] tabular-nums"
                  >
                    {topAmountSentFormatted}
                  </span>
                  <Select
                    value={topSentCurrency}
                    onValueChange={(val) =>
                      setTopSentCurrency(val as "GBP" | "USD" | "NGN")
                    }
                  >
                    <SelectTrigger
                      data-testid="select-settings-total-currency"
                      className="h-7 w-[76px] rounded-full text-xs bg-white border border-[#d2d0ce] shadow-none font-medium text-[#323130] px-2.5"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="NGN">NGN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-md border border-[#e8e8e8] bg-white px-6 py-5 shadow-2xs">
                <div className="text-xs text-[#605e5c]">Wallet</div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-[#323130]">
                    Amount sent
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      data-testid="settings-wallet-amount-sent"
                      className="text-sm font-medium text-[#2e5bff] tabular-nums"
                    >
                      {walletAmountSentFormatted}
                    </span>
                    <Select
                      value={walletCurrency}
                      onValueChange={(val) =>
                        setWalletCurrency(val as WalletCurrencyAccount["code"])
                      }
                    >
                      <SelectTrigger
                        data-testid="select-settings-wallet-currency"
                        className="h-7 w-[76px] rounded-full text-xs bg-white border border-[#d2d0ce] shadow-none font-medium text-[#323130] px-2.5"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WALLET_CURRENCY_ACCOUNTS.map((acct) => (
                          <SelectItem key={acct.code} value={acct.code}>
                            {acct.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-[#e8e8e8] bg-white px-6 py-5 shadow-2xs">
                <div className="text-xs text-[#605e5c]">Payment account</div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-[#323130]">
                    Amount sent
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      data-testid="settings-payment-account-amount"
                      className="text-sm font-medium text-[#2e5bff] tabular-nums"
                    >
                      {paymentAccountFormatted}
                    </span>
                    <Select
                      value={paymentCurrency}
                      onValueChange={(val) =>
                        setPaymentCurrency(
                          val as CollectionCurrencyAccount["code"]
                        )
                      }
                    >
                      <SelectTrigger
                        data-testid="select-settings-payment-currency"
                        className="h-7 w-[76px] rounded-full text-xs bg-white border border-[#d2d0ce] shadow-none font-medium text-[#323130] px-2.5"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLLECTION_CURRENCY_ACCOUNTS.map((acct) => (
                          <SelectItem key={acct.code} value={acct.code}>
                            {acct.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 3: Change password ─────────────────────────────────────────── */}
        {activeTab === "password" && (
          <form
            data-testid="panel-settings-password"
            onSubmit={handlePasswordSubmit}
            className="max-w-4xl space-y-5 pt-2"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="input-existing-password"
                className="text-xs font-medium text-[#323130]"
              >
                Existing password
              </Label>
              <div className="relative">
                <Input
                  id="input-existing-password"
                  data-testid="input-existing-password"
                  type={showExistingPassword ? "text" : "password"}
                  value={existingPassword}
                  onChange={(e) => setExistingPassword(e.target.value)}
                  placeholder="Enter existing password"
                  autoComplete="current-password"
                  className="h-11 pr-10 bg-white border-slate-200 text-sm text-[#323130]"
                />
                <button
                  type="button"
                  data-testid="toggle-existing-password"
                  onClick={() => setShowExistingPassword((prev) => !prev)}
                  aria-label={
                    showExistingPassword
                      ? "Hide existing password"
                      : "Show existing password"
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showExistingPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="input-new-password"
                className="text-xs font-medium text-[#323130]"
              >
                New password
              </Label>
              <div className="relative">
                <Input
                  id="input-new-password"
                  data-testid="input-new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="h-11 pr-10 bg-white border-slate-200 text-sm text-[#323130]"
                />
                <button
                  type="button"
                  data-testid="toggle-new-password"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="input-confirm-new-password"
                className="text-xs font-medium text-[#323130]"
              >
                Confirm new password
              </Label>
              <div className="relative">
                <Input
                  id="input-confirm-new-password"
                  data-testid="input-confirm-new-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="h-11 pr-10 bg-white border-slate-200 text-sm text-[#323130]"
                />
                <button
                  type="button"
                  data-testid="toggle-confirm-new-password"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                data-testid="button-submit-change-password"
                disabled={isChangingPassword}
                className="w-full h-11 rounded-full bg-[#2e5bff] hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Change password"
                )}
              </Button>
            </div>
          </form>
        )}

        {/* ── Tab 4: My cards ────────────────────────────────────────────────── */}
        {activeTab === "cards" && (
          <div data-testid="panel-settings-cards" className="pt-2">
            {savedCards.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-[#605e5c]">
                  You do not have any saved payment cards right now.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {savedCards.map((card) => {
                  const isVisa = card.scheme === "visa";
                  return (
                    <div
                      key={card.id}
                      data-testid={`saved-card-${card.last4}`}
                      className={cn(
                        "relative overflow-hidden rounded-2xl p-6 text-white shadow-md min-h-[205px] flex flex-col justify-between select-none",
                        isVisa
                          ? "bg-gradient-to-br from-[#1d3b66] via-[#0e5499] to-[#0a6ad1]"
                          : "bg-gradient-to-br from-[#2d2d2d] via-[#1c1c1c] to-[#111111]"
                      )}
                    >
                      {/* Subtle background watermark */}
                      {isVisa ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-3 bottom-6 text-7xl font-black italic tracking-tight text-white/[0.06]"
                        >
                          VISA
                        </span>
                      ) : (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-4 bottom-4 flex items-center opacity-[0.08]"
                        >
                          <div className="h-24 w-24 rounded-full bg-white" />
                          <div className="-ml-10 h-24 w-24 rounded-full bg-white" />
                        </div>
                      )}

                      {/* Top row: Gold EMV chip + contactless icon on left; scheme badge on right */}
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <svg
                            viewBox="0 0 44 32"
                            aria-hidden="true"
                            className="h-8 w-11 shrink-0 rounded-md shadow-2xs"
                          >
                            <rect
                              x="0.5"
                              y="0.5"
                              width="43"
                              height="31"
                              rx="5"
                              fill="#E6C365"
                              stroke="#C59B38"
                            />
                            <path
                              d="M15 1v30M29 1v30M1 11h14M29 11h14M1 21h14M29 21h14"
                              stroke="#B38928"
                              strokeWidth="1.2"
                              fill="none"
                            />
                            <rect
                              x="15"
                              y="9"
                              width="14"
                              height="14"
                              rx="2"
                              fill="none"
                              stroke="#B38928"
                              strokeWidth="1.2"
                            />
                          </svg>
                          <Wifi
                            aria-hidden="true"
                            className="h-4 w-4 rotate-90 text-white/80"
                          />
                        </div>

                        <div className="h-8 min-w-[54px] px-2.5 rounded-md bg-white flex items-center justify-center shadow-2xs">
                          {isVisa ? (
                            <span className="text-sm font-black italic tracking-tight text-[#1434CB]">
                              VISA
                            </span>
                          ) : (
                            <svg
                              viewBox="0 0 36 22"
                              aria-label="Mastercard"
                              className="h-5 w-8"
                            >
                              <circle cx="13" cy="11" r="9" fill="#EB001B" />
                              <circle
                                cx="23"
                                cy="11"
                                r="9"
                                fill="#F79E1B"
                                fillOpacity="0.9"
                              />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Masked card number */}
                      <div className="relative z-10 my-4 font-mono text-lg sm:text-xl tracking-[0.18em] text-white/95 tabular-nums">
                        •••• •••• •••• {card.last4}
                      </div>

                      {/* Bottom row: Cardholder + expiry on left; Trash button on right */}
                      <div className="relative z-10 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            data-testid={`saved-card-holder-${card.last4}`}
                            className="truncate text-xs font-semibold tracking-wider text-white uppercase"
                          >
                            {cardholderName}
                          </div>
                          <div className="mt-0.5 text-[11px] font-medium text-white/75 tabular-nums">
                            {card.expiry}
                          </div>
                        </div>

                        <button
                          type="button"
                          data-testid={`button-remove-card-${card.last4}`}
                          onClick={() => setCardPendingRemoval(card)}
                          aria-label={`Remove card ending in ${card.last4}`}
                          className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 5: My bank accounts ────────────────────────────────────────── */}
        {activeTab === "banks" && (
          <div data-testid="panel-settings-banks" className="space-y-5 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-base font-semibold text-[#323130]">
                  My bank accounts
                </h2>
                <p className="mt-1 text-xs text-[#605e5c] leading-relaxed">
                  These are your own bank accounts from KYC. Receive money, invoices, and campaigns pay into the one you mark as primary — never a Send money recipient.
                </p>
              </div>

              <button
                type="button"
                data-testid="button-settings-add-bank"
                onClick={() => {
                  resetAddBankForm();
                  setIsAddBankOpen(true);
                }}
                className="self-start shrink-0 rounded-full border border-[#5c7cfa] bg-white text-[#2e5bff] hover:bg-blue-50 px-5 h-9 text-xs font-semibold transition-colors cursor-pointer"
              >
                Add your bank account
              </button>
            </div>

            <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
              {payoutAccountsQuery.isLoading ? (
                <div className="py-12 flex items-center justify-center text-sm text-[#605e5c]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#2e5bff]" />
                  Loading your bank accounts...
                </div>
              ) : (payoutAccountsQuery.data ?? []).length === 0 ? (
                <div className="py-10 px-6 text-center text-sm text-[#605e5c]">
                  No verified bank accounts yet. Add your bank account above to receive payouts.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                      <TableHead className="text-xs font-semibold text-[#605e5c]">
                        Bank
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#605e5c]">
                        Holder
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#605e5c]">
                        Account
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#605e5c]">
                        Country
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-[#605e5c]">
                        Currency
                      </TableHead>
                      <TableHead className="w-[110px] text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payoutAccountsQuery.data ?? []).map((acc) => {
                      const iso3 =
                        ISO2_TO_ISO3[acc.country.toUpperCase()] ??
                        acc.country.toUpperCase();
                      return (
                        <TableRow
                          key={acc.id}
                          data-testid={`bank-account-row-${acc.id}`}
                        >
                          <TableCell className="text-sm font-medium text-[#323130]">
                            <span>{acc.bankName.toUpperCase()}</span>
                            {acc.isDefault ? (
                              <span
                                data-testid={`badge-primary-bank-${acc.id}`}
                                className="ml-2 inline-flex items-center rounded-full bg-[#2e5bff] px-2 py-0.5 text-[10px] font-semibold text-white"
                              >
                                Primary
                              </span>
                            ) : (
                              <button
                                type="button"
                                data-testid={`button-set-primary-${acc.id}`}
                                disabled={settingPrimaryId === acc.id}
                                onClick={() => void handleSetPrimary(acc.id)}
                                className="ml-2 text-xs font-medium text-[#2e5bff] hover:underline cursor-pointer disabled:opacity-50"
                              >
                                {settingPrimaryId === acc.id
                                  ? "Updating..."
                                  : "Set primary"}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-[#323130]">
                            {acc.holderName}
                          </TableCell>
                          <TableCell className="text-sm font-mono text-[#323130] tabular-nums">
                            {acc.maskedNumber}
                          </TableCell>
                          <TableCell className="text-sm text-[#323130]">
                            {iso3}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-[#323130]">
                            {acc.currency}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              data-testid={`button-remove-bank-${acc.id}`}
                              onClick={() => setBankPendingRemoval(acc)}
                              className="rounded-full border border-slate-300 bg-white px-3.5 h-8 text-xs font-medium text-[#323130] hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Dialog: Request profile change ───────────────────────────────────── */}
      <Dialog
        open={changeRequestField !== null}
        onOpenChange={(open) => {
          if (!open) {
            setChangeRequestField(null);
            setChangeReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request profile change</DialogTitle>
            <DialogDescription>
              Tell us what needs updating for{" "}
              <span className="font-medium text-[#323130]">
                {changeRequestField?.label.toLowerCase()}
              </span>
              . Verified KYC records are reviewed before changes take effect.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label
              htmlFor="textarea-profile-change-reason"
              className="text-xs font-medium text-[#323130]"
            >
              Reason and updated details <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="textarea-profile-change-reason"
              data-testid="textarea-profile-change-reason"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Explain what changed and provide the new verified detail..."
              rows={4}
              className="bg-white text-sm"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="button-cancel-profile-change"
              onClick={() => {
                setChangeRequestField(null);
                setChangeReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="button-submit-profile-change"
              onClick={handleSubmitProfileChangeRequest}
              className="bg-[#2e5bff] hover:bg-blue-700 text-white"
            >
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Remove saved card confirmation ───────────────────────────── */}
      <Dialog
        open={cardPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setCardPendingRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove card?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove your{" "}
              {cardPendingRemoval?.scheme === "visa" ? "Visa" : "Mastercard"} card
              ending in <span className="font-medium">{cardPendingRemoval?.last4}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="button-cancel-remove-card"
              onClick={() => setCardPendingRemoval(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="button-confirm-remove-card"
              onClick={handleConfirmRemoveCard}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Add your bank account ────────────────────────────────────── */}
      <Dialog
        open={isAddBankOpen}
        onOpenChange={(open) => {
          if (!open) setIsAddBankOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add your bank account</DialogTitle>
            <DialogDescription>
              Add a personal or business bank account in your verified KYC name (
              <span className="font-medium text-[#323130]">
                {deriveFullName(activeUser) || "Verified Account Holder"}
              </span>
              ).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddBankSubmit} className="space-y-4 py-1">
            {/* Mandatory fields first */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#323130]">
                Country and currency <span className="text-red-500">*</span>
              </Label>
              <Select
                value={bankCountry}
                onValueChange={(val) => {
                  setBankCountry(val);
                  setBankRoutingInput("");
                }}
              >
                <SelectTrigger
                  data-testid="select-settings-bank-country"
                  className="bg-white text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_CORRIDOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.country} value={opt.country}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="input-settings-bank-name"
                className="text-xs font-medium text-[#323130]"
              >
                Bank name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="input-settings-bank-name"
                data-testid="input-settings-bank-name"
                value={bankNameInput}
                onChange={(e) => setBankNameInput(e.target.value)}
                placeholder="e.g. Barclays, Chase, Access Bank"
                className="bg-white text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="input-settings-account-number"
                className="text-xs font-medium text-[#323130]"
              >
                Account number / IBAN <span className="text-red-500">*</span>
              </Label>
              <Input
                id="input-settings-account-number"
                data-testid="input-settings-account-number"
                value={bankAccountInput}
                onChange={(e) => setBankAccountInput(e.target.value)}
                placeholder="Enter account number or IBAN"
                className="bg-white text-sm"
              />
            </div>

            {activeBankCorridor.routingLabel && activeBankCorridor.routingRequired && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="input-settings-routing-number"
                  className="text-xs font-medium text-[#323130]"
                >
                  {activeBankCorridor.routingLabel}{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="input-settings-routing-number"
                  data-testid="input-settings-routing-number"
                  value={bankRoutingInput}
                  onChange={(e) => setBankRoutingInput(e.target.value)}
                  placeholder={activeBankCorridor.routingPlaceholder}
                  className="bg-white text-sm"
                />
              </div>
            )}

            {/* Optional fields strictly below mandatory fields */}
            {activeBankCorridor.routingLabel && !activeBankCorridor.routingRequired && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="input-settings-routing-optional"
                  className="text-xs font-medium text-[#323130]"
                >
                  {activeBankCorridor.routingLabel} (optional)
                </Label>
                <Input
                  id="input-settings-routing-optional"
                  data-testid="input-settings-routing-number"
                  value={bankRoutingInput}
                  onChange={(e) => setBankRoutingInput(e.target.value)}
                  placeholder={activeBankCorridor.routingPlaceholder}
                  className="bg-white text-sm"
                />
              </div>
            )}

            <DialogFooter className="pt-2 gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="button-cancel-add-bank"
                onClick={() => setIsAddBankOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-confirm-add-bank"
                disabled={isAddingBank}
                className="bg-[#2e5bff] hover:bg-blue-700 text-white"
              >
                {isAddingBank ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add bank account"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Remove bank account confirmation ─────────────────────────── */}
      <Dialog
        open={bankPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !isRemovingBank) setBankPendingRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove bank account?</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium text-[#323130]">
                {bankPendingRemoval?.bankName}
              </span>{" "}
              ({bankPendingRemoval?.maskedNumber}) from your payout accounts?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="button-cancel-remove-bank"
              disabled={isRemovingBank}
              onClick={() => setBankPendingRemoval(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="button-confirm-remove-bank"
              disabled={isRemovingBank}
              onClick={() => void handleConfirmRemoveBank()}
            >
              {isRemovingBank ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
