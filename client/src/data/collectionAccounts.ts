export interface CollectionCurrencyAccount {
  code: "GBP" | "USD" | "NGN";
  name: string;
  flagCode: "gb" | "us" | "ng";
  demoBalance: number;
  bankCountry: string;
  bankName: string;
  accountNumber: string;
  bankAddress: string;
  routingLabel: string;
  routingValue: string;
}

export interface WalletCurrencyAccount {
  code: "GBP" | "NGN";
  name: string;
  flagCode: "gb" | "ng";
  demoBalance: number;
  demoAmountSent: number;
  demoTxCount: number;
}

export const DEMO_GBP_TOTAL_SENT = 750895.75;
export const DEMO_GBP_WALLET_BALANCE = 253007.92;
export const DEMO_GBP_COLLECTION_BALANCE = 4357384.08;

export const COLLECTION_CURRENCY_ACCOUNTS: CollectionCurrencyAccount[] = [
  {
    code: "GBP",
    name: "British Pounds",
    flagCode: "gb",
    demoBalance: DEMO_GBP_COLLECTION_BALANCE,
    bankCountry: "UK",
    bankName: "The Currency Cloud Limited",
    accountNumber: "08260110",
    bankAddress: "1 Sheldon Square, London, W2 6TT, United Kingdom",
    routingLabel: "Sort Code",
    routingValue: "123456",
  },
  {
    code: "USD",
    name: "US Dollars",
    flagCode: "us",
    demoBalance: 2641.84,
    bankCountry: "USA",
    bankName: "Community Federal Savings Bank",
    accountNumber: "8310049201",
    bankAddress: "89-16 Jamaica Ave, Woodhaven, NY 11421, United States",
    routingLabel: "Routing Number",
    routingValue: "026073150",
  },
  {
    code: "NGN",
    name: "Nigerian Naira",
    flagCode: "ng",
    demoBalance: 0,
    bankCountry: "Nigeria",
    bankName: "Providus Bank PLC",
    accountNumber: "9978120455",
    bankAddress: "Plot 54, Ademola Adetokunbo Street, Victoria Island, Lagos, Nigeria",
    routingLabel: "Bank Code",
    routingValue: "101",
  },
];

export const WALLET_CURRENCY_ACCOUNTS: WalletCurrencyAccount[] = [
  {
    code: "GBP",
    name: "British Pounds",
    flagCode: "gb",
    demoBalance: DEMO_GBP_WALLET_BALANCE,
    demoAmountSent: DEMO_GBP_TOTAL_SENT,
    demoTxCount: 89,
  },
  {
    code: "NGN",
    name: "Naira",
    flagCode: "ng",
    demoBalance: 0,
    demoAmountSent: 0,
    demoTxCount: 0,
  },
];

export function formatAccountAmount(value: number): string {
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
