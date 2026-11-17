# Governance Decisions Register (`decisions.md`)

> **Standard:** Universal AI Agent Governance Standard (v1.0) — §03, §08, §09  
> **Repository:** `Rhemito-UI` & `PromoCode` (Mito Money Admin / Referral & Bonus Engine)

---

## Active Approved Decisions

### `DEC-2026-11-16-REFEREE-SIGNUP-BONUS` — Referee Instant Sign-Up Bonus & First-Transaction Redemption

- **Date Approved:** 16 November 2026 (`2026-11-16`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner)
- **Status:** `Human-Approved` (Active Baseline)
- **Affected Repositories & Modules:**
  - `PromoCode` (`server/referral.js`, `server/bonus/wallet.js`, `server/tests/contracts/referral.contract.test.js`, `Docs/Requirements/*.md`)
  - `Rhemito-UI` (`client/src/components/rewards/ReferralSignup.tsx`, `client/src/lib/rewards.ts`, `client/src/pages/Dashboard.tsx`, `client/src/pages/ReferralLanding.tsx`, `client/src/components/rewards/ReferEarnCard.tsx`, `client/src/components/rewards/ExistingUserReferralCard.tsx`, `server/referralOpenGraph.ts`, `docs/requirements/*.md`)

#### 1. Business Decision Summary
1. **Instant Referee Welcome Credit on Sign-Up (`REGISTERED`):**
   - A referee who registers via a referral link or referral code receives their welcome bonus credit (`referee_reward`) **immediately upon signing up** (`status = 'REGISTERED'`) when the matched rule rewards the referee (`reward_type === 'BOTH'` or `'REFEREE'`, `referee_reward > 0`) and the referee is not blocked by `eligibilityGuard`.
   - Referee welcome credit issuance is **no longer gated on `referee.kyc_status === 'PASSED'`** at registration or rule-upgrade backfill (`createReferral`, `updateRule`, `tryAward`), because bonus credit is non-withdrawable and Rhemito enforces mandatory KYC verification before any Send Money transfer can be paid.
   - Referrer reward (`referrer_reward`) continues to be issued **only when the referee's first qualifying transfer reaches `COMPLETED`** AND continues to require the referrer to have passed KYC (`status_reason = 'Awaiting referrer KYC'` when `referrer.kyc_status !== 'PASSED'`).
2. **Redemption on First Valid Qualifying Transaction:**
   - The referee can redeem their welcome bonus credit (`Pay less` or `Send more`) on their **first valid transaction** that meets the referral rule's **Floor** (`min_transaction_threshold`, `BELOW_FLOOR`) and **Corridor** (`receive_currency`, `WRONG_CORRIDOR`) within the qualification/validity window.
   - Redeeming the referee bonus on that first qualifying transaction still reports the full pre-discount `sendAmount` (`amount >= floor`) to `POST /api/referral/transfer-events`, transitioning the referral `REGISTERED → PENDING → REWARDED` and crediting the referrer (`referrer_reward`) without double-crediting the referee (`!refereeCreditId` / idempotent `<referralId>:referee`).
   - If the first transaction is `CANCELLED` or `FAILED`, `releaseBonus` restores the referee's welcome bonus credit and `handleTransferEvent` returns the referral to `REGISTERED`.
   - If a completed qualifying transfer where the referee redeemed their sign-up bonus is subsequently `REFUNDED` (`REFERRAL_REVERSAL`), `voidCredit` and `releaseBonus` ensure any returned `BONUS_RETURNED` child credit is voided and subtracted from `spent` so both `BONUS_CLAWBACK=on` and `BONUS_CLAWBACK=off` (in either event arrival order) leave `available = 0` and `outstanding_debt = 0`.
3. **UI Copy & Layout (Direction A + Dashboard Option 1):**
   - **Direction A (Referral Signup, Landing, Share, Refer & Earn, OpenGraph):**
     - `ReferralInviteStrip` headline: `<Name> invited you – get <referee_reward> bonus credit on joining via link.`
     - `ReferralInviteStrip` 3-step bar (`BOTH`): `1. Join` → `2. Send <floor>+[ to <RCV>] in <QW> days` → `3. <Name> gets <referrer_reward>` (and `1. Join` → `2. Get <referee_reward> on sign-up` → `3. Send <floor>+...` for `REFEREE`-only).
     - `ReferralInviteStrip` 3rd bullet: `<referee_reward> welcome bonus credit added automatically when you sign up using the link`.
     - `ReferralCodeField` applied hook (`referral-code-hook`): `You get <referee_reward> on sign-up (<Name> gets <referrer_reward> on your first successful transaction)`.
     - `referralHelpText("REGISTERED")`: `Waiting for their first successful transfer of <floor> or more · <n> day(s) left`.
   - **Dashboard Option 1 (`Dashboard.tsx` `rewards-section-bonus-banners`):**
     - Responsive `xl:flex-row` outer layout + `whitespace-nowrap` on `referral-bonus-earned-pill` so `Welcome bonus · Invited by <Name>` always renders on a single line without wrapping.

#### 2. Alternatives Evaluated
| Option | Summary | Outcome |
| :--- | :--- | :--- |
| **Direction A (Selected)** | Preserves `Join` · `Send <floor>+ to <RCV> in <QW> days` · `<Name> gets <referrer_reward>` matching Product Owner red-markup annotations and existing E2E step-2 pattern while stating instant sign-up credit in headline & bullet 3. | **Approved by Mohammad (2026-11-16)** |
| **Direction B** | Changes Step 1 to `Join & get £21.00` and Step 2 to `Redeem on £50.00+...`. | Rejected (denser mobile wrapping, diverges from red markup). |
| **Dashboard Option 1 (Selected)** | Keep `Welcome bonus · Invited by John Doe` in `referral-bonus-earned-pill` and prevent 2-line wrapping via `xl:flex-row` + `whitespace-nowrap`. | **Approved by Mohammad (2026-11-16)** |
| **Dashboard Option 2** | Move `Invited by John Doe` into the subtitle paragraph below the pill. | Rejected in favour of Option 1. |

#### 3. Superseded Baseline Rules (Preserved for Audit History — §09)
- `REF-MITO-v1.1` (08/10/2026) `D5` (*"Credit is issued only when the qualifying transfer reaches COMPLETED"*) → Superseded for referee credit (`REGISTERED`); retained for referrer credit (`COMPLETED`).
- `REF-MITO-v1.1` (08/10/2026) `D8` / `BR-34` (*"Both parties must have passed KYC before their credit is issued"* / `Awaiting referee KYC`) → Superseded for referee credit; retained for referrer credit (`Awaiting referrer KYC`).
- `REFERRAL-13` (`PromoCode/server/tests/contracts/referral.contract.test.js`) → Updated 2026-11-16 to assert immediate referee credit on sign-up with `kyc_status: 'PENDING'` and referrer hold on `Awaiting referrer KYC`.

---

### `DEC-2026-11-17-HIDE-WAYS-TO-EARN` — Hide `Ways to earn` Section on `Reward$` Overview
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner)
- **Status:** `Human-Approved` (`Option 1 — Hide completely`)
- **Affected Files (`Rhemito-UI`):** `client/src/pages/BonusAndDiscounts.tsx`, `docs/requirements/BONUS_MODULE_SPEC_RHEMITO.md` (plus `REF-23` / `bonus.spec.js` test sync after live URL confirmation)
- **Summary & Superseded Baseline:** `<WaysToEarn />` (`data-testid="ways-to-earn"`) is no longer rendered on `/bonus-discounts` (`Reward$` → `Overview`), superseding `BONUS_MODULE_SPEC_RHEMITO.md` §7.4 while keeping `WaysToEarn.tsx` and all backend bonus scheme awarding intact.

---

### `DEC-2026-11-17-STAGING-PAYMENT-GATEWAY` — Staging Payment Gateway Opening, Bonus/Promo Commission Alignment & Non-Silent Gateway Error Guard
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner)
- **Status:** `Release Approved` (`Option 1 — Render Staging Rhemito-UI Fix Package` · `Verified`)
- **Affected Files (`Rhemito-UI`):** `shared/sendMoney.ts`, `server/mitoRetail/index.ts`, `server/sendMoneyRoutes.ts`, `client/src/pages/SendMoney.tsx`, `tests/e2e/staging_payment_gateway.spec.js`
- **Summary:**
  1. **Commission Alignment on Bonus & Promo Transfers:** Plain transfers (`!hasRewardOrPromo`) remain unchanged. When a Promo Code or Bonus Credit (`pay_less` or `send_more`) is applied, `sendAmountMinorForMito` reflects the payout boost (`send_more`) or net discount (`pay_less` / `fee` promo / `amount` promo, clamped `>= 100` minor units), while `commissionNum` is always aligned to `lockedRate.commission` (including on `sendMitoTransaction` retry) so `furp02-staging` (`POST /api/v1/Transaction/SendMoney`) never rejects the locked `rateId` for commission mismatch.
  2. **Newly Signed-Up Referee & `collectionMode` Beneficiary Resolution:** Step 3 (`POST /api/send-money/transactions`) persists optional recipient banking/mobile details, falls back `mitoUserId` to `DEFAULT_MITO_SENDER_USER_ID` when `registerOrSyncMitoRetailUser` returns `null`, and generates a deterministic per-user fallback phone suffix in `mapAuthUserToMitoCreatePayload` when mobile number is empty. Step 4 (`sendMitoForSendMoneyTx`) filters saved beneficiaries strictly by `collectionMode` (`BANKACCOUNT` vs `MOBILEMONEY`) and `receiveCurrency`, creates the Mito beneficiary on-demand if missing, and preserves `promoAtPayment` / `bonusCredit` (`mode` & `amount`) on `isMitoStep4Reclick`.
  3. **No Silent Fake Completion on Staging Gateway Failure:** `sendMitoTransaction` parses object or JSON-string `paymentSession` and reports `ok` / `httpStatus`. When `isMitoRetailConfigured()` is `true` and `paymentMethod` is `card` or `instant_bank`, `POST /api/send-money/transactions/:id/pay` requires a valid gateway target (`mitoPaymentSession` or `http(s)` `mitoPaymentUrl`/`mitoHostedUrl`); otherwise it releases any reserved promo/bonus (`PAY-04`), keeps `tx.status === "awaiting_payment"`, and returns `502 PAYMENT_GATEWAY_ERROR` so `SendMoney.tsx` shows the destructive `"Payment not completed"` toast (`PAY-13`) instead of faking `"Payment Successful"`.
  4. **Frontend Step 4 Fallbacks, Inline Pre-Submit Card Error & Step 1 KYC Fallback (`SendMoney.tsx`):** Supports hosted card URL & `mitoHostedUrl` fallbacks, keeps pre-ready Checkout.com SDK mount/init errors inline inside `mito-card-checkout-section` instead of unmounting the card form, uses the signed-in user's name for `cardholderName`, and triggers fallback `fetchMitoKycJourney` on Step 1 whenever `isTransactionAllowed === false || isKycRequired === true || isProfileUpdateRequired === true` with `!kycUrl`.

---

### `DEC-2026-11-17-RECENT-TRANSACTIONS-ALL-SORT` — Recent Transactions `'All'` Tab Latest-Transaction Sorting & Immediate Cache Refresh
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — defect fix on `fix/staging-payment-gateway`)
- **Status:** `Release Approved` (`Verified`)
- **Affected Files (`Rhemito-UI`):** `client/src/lib/unifiedTransactions.ts`, `client/src/pages/Dashboard.tsx`, `client/src/pages/Transactions.tsx`, `client/src/pages/SendMoney.tsx`, `client/src/__tests__/unified-transactions.test.ts`, `tests/e2e/staging_payment_gateway.spec.js`
- **Summary:**
  1. Added pure `sendMoneyDateSort(view, fallbackDateLabel)` helper in `unifiedTransactions.ts` computing full millisecond-precision sort timestamps (`Math.max(Date.parse(paidAt), Date.parse(createdAt))`) instead of parsing `toSendMoneyRow(view).date` (`"16 Nov 2026"`, midnight `00:00:00`), so newly completed Send Money transfers always appear at the top of `'All'` above earlier same-day Campaigns, Invoices, Money Requests, and earlier same-day Send Money transfers (preserving `toSendMoneyRow`'s contract return shape).
  2. Added deterministic `tx.id` tie-breaking in `Dashboard.tsx` and `Transactions.tsx` `mergedRows` sorting.
  3. Added `syncSendMoneyCache(txView?)` in `SendMoney.tsx` to optimistically upsert newly created/paid Send Money transactions into `["/api/send-money/transactions"]` and invalidate transaction/notification queries immediately on Step 3 creation, Step 4 payment/outcome, and manual bank transfer submission.

---

### `DEC-2026-11-17-CARD-3DS-AND-GATEWAY-CONFIRMATION` — Native Checkout.com 3DS Unblocking & Two-Phase Gateway Payment Confirmation
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — `Option A` approved on `fix/card-3ds-and-gateway-confirmation`)
- **Status:** `Release Approved` (`Option A — Native 3DS Unblock + Two-Phase Gateway Confirmation` · `Verified`)
- **Affected Files (`Rhemito-UI`):** `server/sendMoneyRoutes.ts`, `server/mitoRetail/index.ts`, `client/src/lib/sendMoney.ts`, `client/src/pages/SendMoney.tsx`, `client/src/__tests__/contracts/gateway-confirmation.test.ts`, `tests/e2e/staging_payment_gateway.spec.js`
- **Summary:**
  1. **Native Checkout.com 3DS Unblocking (`SendMoney.tsx`, `server/sendMoneyRoutes.ts`):** Stopped intercepting `checkout.com` / 3DS / non-terminal `data.status` `postMessage` events with `stopImmediatePropagation()` so `CheckoutWebComponents` completes 3DS2 authentication natively, authorizes/captures the Checkout.com Payment Session (`ps_...`), populates card AVS postcode in FURP, and triggers `furp02-staging` payment completion. `POST /api/send-money/mito/resolve-card-redirect` never fetches `checkout.com` interactive 3DS URLs and never defaults missing status to `"COMPSUCCESS"` (returning `status: null` instead).
  2. **Two-Phase Gateway Confirmation (`server/sendMoneyRoutes.ts`, `client/src/lib/sendMoney.ts`, `SendMoney.tsx`):** Preserves `shared/sendMoney.ts` `statusForPaymentMethod()` unchanged (`PAY-01..PAY-15` intact). When `isMitoRetailConfigured()` is `true` and `paymentMethod` is `card` or `instant_bank` with a live gateway session/URL, `POST /api/send-money/transactions/:id/pay` keeps `status: "awaiting_payment"` (`paidAt: null`, deferring `transaction_complete` and `PAID`/`COMPLETED` reward events) and skips duplicate `InitiateHostedTransaction` when `Transaction/SendMoney` succeeded. Added `POST /api/send-money/transactions/:id/confirm-gateway` (`confirmSendMoneyGateway`) + Mito webhook sync (`payment_collected`, `payment_captured`, `compsuccess`, `processed`) to idempotently complete paid sessions or release held Promo/Bonus and restore retryable `awaiting_payment` state on decline/cancel/method switch.

---

### `DEC-2026-11-17-CARD-PAYMENT-COMPLETION-SYNC` & `DEC-2026-11-17-ALL-PAYMENT-METHODS-DASHBOARD-REDIRECT` — Card 3DS Return-Origin Completion Sync & Post-Payment Dashboard Redirect Across All Payment Methods
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — Card defect fix + `Option A` approved on `fix/card-payment-status-sync`)
- **Status:** `Release Approved` (`Option A` · `Verified` — UI flow approved by Product Owner on `http://localhost:5000/send-money`, contract & Playwright E2E tests added)
- **Affected Files (`Rhemito-UI`):** `server/mitoRetail/index.ts`, `server/sendMoneyRoutes.ts`, `client/src/lib/sendMoney.ts`, `client/src/pages/SendMoney.tsx`, `client/src/__tests__/contracts/gateway-confirmation.test.ts`, `tests/e2e/staging_payment_gateway.spec.js`, `docs/governance/decisions.md`, `docs/governance/traceability.md`
- **Summary:**
  1. **Card `RedirectSuccessUrl` Origin Preservation (`${cleanOrigin}/send/status`) & 3DS Completion Sync:**
     - Verified live on `furp02-staging.funtechcom.com` (`tnxref=22505775`) that after Checkout.com 3DS2 capture, `furp02-staging` registers the payment (`status=COMPSUCCESS&paymentStatus=Captured`) and redirects the browser to `(RedirectSuccessUrl || "https://rhemito-web-nextjs-dev.herokuapp.com/send/status") + "?tnxref=<tnxref>&status=COMPSUCCESS&paymentStatus=Captured"`.
     - Updated `server/sendMoneyRoutes.ts` and `server/mitoRetail/index.ts` so `CARDCHECKOUT` sets `RedirectSuccessUrl` to the active caller's clean `/send/status` URL (`http://localhost:5000/send/status` locally, `https://rhemito-ui.onrender.com/send/status` on Render — never rewriting `localhost` to `onrender.com`, never omitting `RedirectSuccessUrl` to fall back to `rhemito-web-nextjs-dev.herokuapp.com`, and never pointing to `/send-money`).
     - Updated `SendMoney.tsx` (`/send/status` + nested-iframe `window.top.postMessage`) and `POST /api/send-money/mito/resolve-card-redirect` + `POST /api/send-money/transactions/:id/confirm-gateway` (`syncMitoCardPaymentStatus` in `server/mitoRetail/index.ts`) to also invoke Mito Staging's `[AllowAnonymous]` `GET /api/v1/Payment/CheckoutPaymentSatus?cko-session-id=<pay_...>` server-side (`redirect: "manual"`). Inspection of Azure DevOps `furp02-core` (`Staging` branch: `TransactionRequestHandler.cs` L522–576, `CheckoutWebhookHandler.cs` L144–154, `CheckoutRequestHandler.cs` L126–221) proved that Mito Staging stores `PaymentReference = ps_...` while Checkout.com webhooks send `data.id = pay_...` (so Mito's webhook never matches `isNewFlow: true` sessions), making `GET /api/v1/Payment/CheckoutPaymentSatus?cko-session-id=<pay_...>` (`ProcessOrder(result.Id)`) the sole handler that marks Mito Staging `PAID` / `AWAITINGPROCESSING` / `INREVIEW`. Calling it server-side captures the payment in Mito Staging while keeping the customer's browser on `Rhemito-UI`.
  2. **Post-Payment Dashboard Redirect Across All Payment Methods (`Option A`):**
     - **Credit/Debit Card, Instant Pay By Bank & Wallet:** Show the `Payment Successful` / `Payment Authorized` confirmation screen and auto-redirect to Dashboard (`/`) after the 6s countdown (`isPaidOrProcessing`), while keeping `failed` / `cancelled` / `expired` attempts on Step 4 (`redirectCountdown = null`) so the customer can retry immediately.
     - **Manual Bank Transfer:** Clicking **"I have made the Payment"** (`button-manual-transfer-made-payment`) dispatches the `"Payment confirmation received"` toast, syncs the transaction cache, and redirects directly to Dashboard (`/`).
     - *Superseded Behaviour:* Manual Bank Transfer previously stayed on the Bank Transfer Details screen swapping the button to `"Done — Go to Dashboard"` without redirecting automatically; failed/cancelled gateway status views previously started an 8s auto-redirect timer.

---

### `DEC-2026-11-17-PAY-BY-BANK-RETAIL-SETTLEMENT` — Affiliate Pay By Bank (`PLAID`) Settlement via `RetailTransaction` + `RetailCollection` + `MoveRetailToTransaction`
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — Pay By Bank Mito Staging capture fix verified & `approved` on `fix/card-payment-status-sync`)
- **Status:** `Release Approved` (`Verified` — live Mito Staging + Plaid Sandbox + Product Owner UI confirmation + contract & Playwright E2E suites passing)
- **Affected Files (`Rhemito-UI`):** `server/mitoRetail/index.ts`, `server/sendMoneyRoutes.ts`, `client/src/pages/SendMoney.tsx`, `client/src/__tests__/contracts/gateway-confirmation.test.ts`, `tests/e2e/staging_payment_gateway.spec.js`, `docs/governance/decisions.md`, `docs/governance/traceability.md`
- **Summary:**
  1. **Root Cause in `furp02-core` (`Staging` branch):**
     - `Rhemito-UI` authenticates with Mito Staging as Affiliate `1112` (`TestRhemitoAffiliate`). Calling `POST /api/v1/Transaction/SendMoney` (`paymentMethod: "PLAID"`) creates a `dbo.Transactions` row with `transaction.AffiliateId` populated (`TransactionRequestHandler.cs` L54 & `TransactionRequestHandler.CreateTransaction.cs` L190).
     - Although Plaid Sandbox settles the payment (`PAYMENT_STATUS_SETTLED` + `WALLET` `SETTLED`) and delivers `POST /api/v2/Payment/plaid-payment-status-webhook`, `PlaidPaymentStatusWebhookHandler` routes `PlaidPaymentSourceType.Transaction` to `CheckoutTransactionWebhookSettlementService.ApplyPaymentCapturedAsync` (`Furp.Application/Services/CheckoutTransactionWebhookSettlementService.cs` L170–173), which immediately returns (`if (transaction.AffiliateId.HasValue) return;`) without marking `PaymentStatus = PAID` or updating `TransactionStatus`.
  2. **Approved Technical Resolution:**
     - Added `initiateMitoPlaidRetailCollection()` (`server/mitoRetail/index.ts`) to initiate an Affiliate `RetailTransaction` via `POST /api/v1/mito/Transactions/InitiateHostedTransaction` (`PreferredPaymentMethod: "PLAID"`, unique `-PBB-<attempt>` `PartnerReferenceNumber`, validated Mito `reason`/`source-of-funds` shortcodes) paired with a `RetailCollection` (`journeyType: 4`, `paymentProviders: "PLAID"`) journey via `POST /api/v1/mito/Journey` (`AbortSignal.timeout(15000)`), preserving the exact `/retail-payment?journeyCode=JNY-...` Plaid modal & QR flow while routing Plaid's webhook (`PlaidPaymentSourceType.Retail`) through `RetailAffiliatePaymentSettlementService.ApplyRetailPaymentReceivedAsync` (`PlaidPaymentStatusWebhookHandler.Routing.cs` L160).
     - Added `syncMitoPlaidRetailPaymentStatus()` (`server/mitoRetail/index.ts`) wired into `POST /api/send-money/transactions/:id/confirm-gateway` (`outcome: "completed"`), sequentially handling `PaymentConfirmation` (when `AWAITINGAFFILIATEUPDATE`) and `POST /api/v1/HangFire/MoveRetailToTransaction` (when `READYTOPROCESS` / `PAID`) so Mito Staging immediately migrates the paid `RetailTransaction` into `dbo.Transactions` without waiting for the 5-minute Hangfire cron.
     - Hardened `server/sendMoneyRoutes.ts` so failed `PLAID` initiation never falls back to an un-scoped `InitiateHostedTransaction` or stale `mitoHostedUrl` (returning `502 PAYMENT_GATEWAY_ERROR` and releasing reserved Promo/Bonus), and updated `getOwnedTransaction`, `/api/webhooks/mito`, and `SendMoney.tsx` journey polling (`READYTOPROCESS`, `AWAITINGAFFILIATEUPDATE`, `PROCESSED`) to resolve `-PBB-<suffix>` references seamlessly.


---

### `DEC-2026-11-17-DASHBOARD-SUMMARY-AND-SIDEBAR-THEME` — Dashboard Account Summary Pastel Colour Scheme & Left Sidebar Reference Layout
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — approved options matching reference screenshots + live UI confirmed `approved` on `feature/dashboard-summary-and-sidebar-theme`)
- **Status:** `Release Approved` (`Summary Option A` + `Sidebar Option 1` · `Verified`)
- **Affected Files (`Rhemito-UI`):** `client/src/pages/Dashboard.tsx`, `client/src/components/layout/Sidebar.tsx`, `tests/e2e/dashboard.spec.js`, `docs/governance/decisions.md`, `docs/governance/traceability.md`
- **Summary:**
  1. **Dashboard `Account Summary` Pastel Colour Scheme (`Dashboard.tsx`):** Replaced borderless `bg-white` summary card fills with the approved Rhemito reference pastel palette (`#FFEDE7` Peach for *Total sent*, `#E5F1FE` Sky Blue for *Wallet Balance*, `#E0EED6` Sage Green for *Collection Account*), `text-xl font-bold` `Account Summary` heading, `rounded-xl` corners, `#605E5C` WCAG AA-compliant label and figure typography, and crisp `bg-white border-[#d2d0ce]` `GBP` selector pills while preserving existing card titles and `data-testid` attributes.
  2. **Left Sidebar Reference Layout & Cleanup (`Sidebar.tsx`):** Removed `'Rewards waiting!'` subtext and the `'NEW'` pill (`rewards-waiting-badge`) from `Reward$`; aligned the sidebar to the approved reference screenshot (`bg-white` surface, `#2e5bff` circular collapse toggle placed inside the top-right header area of the panel, `#2e5bff` active text/icon highlight without background pill fill, `IdCard` icon for `Compliance`, `#4a4a4a` inactive icons, `#605e5c` inactive labels, airy `py-3` / `gap-5` rhythm, and live unread bell + red count badge on `Notifications` via `["/api/notifications/unread-count"]`).

---

### `DEC-2026-11-17-COLLECTION-ACCOUNT-AND-WALLETS-PAGE` — `/overview/collectionaccount` Multi-Tab Page (`Collection Accounts` & `Wallets`) & Dashboard Card Navigation
- **Date Approved:** 17 November 2026 (`2026-11-17`)
- **Decision Owner / Approver:** Mohammad Mumtaz (Product Owner — `Option A` + live UI confirmed `approved` on `feature/dashboard-summary-and-sidebar-theme`)
- **Status:** `Release Approved` (`Option A` · `Verified`)
- **Affected Files (`Rhemito-UI`):** `client/src/data/collectionAccounts.ts`, `client/src/pages/CollectionAccount.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/components/layout/Sidebar.tsx`, `client/src/App.tsx`, `tests/e2e/dashboard.spec.js`, `docs/governance/decisions.md`, `docs/governance/traceability.md`
- **Summary:**
  1. **Dashboard Summary Card Navigation (`Option A`, `Dashboard.tsx`):** Clicking the **Wallet Balance** card (`card-wallet-balance`) opens `/overview/collectionaccount?tab=wallet`, and clicking the **Collection Account** card (`card-collection-account`) opens `/overview/collectionaccount`, while stopping click/keyboard propagation on the `GBP` `<Select>` pill so currency selection never triggers navigation.
  2. **`/overview/collectionaccount` Page (`CollectionAccount.tsx` & `collectionAccounts.ts`):** Implemented the two-tab reference layout inside `DashboardLayout` (`Overview` kept active in `Sidebar.tsx` on `/overview/*`), featuring `← Back` (`/`), URL-synced `Collection Accounts` and `Wallets` underline tabs, rectangular `flagcdn` currency rails with `#2e5bff` left active indicator, `#ECF5FF` detail panels (`Regular Payments` bank details with clipboard copy + toast on `Collection Accounts`; `Wallet Balance`, `Amount Sent`, and `Number Of Transactions` on `Wallets`), `Send Money` CTA (`/send-money?currency=<CODE>`), and `View Transaction History` (`/transactions`), sharing a single balance source with `Dashboard.tsx`.
