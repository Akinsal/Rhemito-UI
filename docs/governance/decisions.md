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
