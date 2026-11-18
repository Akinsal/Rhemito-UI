/**
 * Referral contracts (REF-*). The referral rules, referrals and rewards live in Mito; Rhemito captures the code
 * from a /ref/:code link, records the referral when the new customer verifies their email, reports transfers, and
 * shows the Refer & Earn card. Self-referral and eligibility are decided by Mito, not by Rhemito.
 */
import React from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import express from "express";
import type { AddressInfo } from "net";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { bootContractApp, resetContractApp, routeBrowserFetchTo, wait, type ContractApp } from "./_mitoStub";
import { rule, source } from "./_contract";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }));
// server/auth.ts imports `log` from server/index.ts, which would boot the whole app on import
vi.mock("../../../../server/index", () => ({ log: () => {} }));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificationContextProvider } from "@/contexts/NotificationContext";
import { ContactsProvider } from "@/contexts/ContactsContext";
import BonusAndDiscounts from "@/pages/BonusAndDiscounts";
import ReferralLanding from "@/pages/ReferralLanding";
import { ReferEarnCard } from "@/components/rewards/ReferEarnCard";
import { ReferralCodeField } from "@/components/rewards/ReferralSignup";
import { REFERRAL_CODE_RE, clearReferral, loadReferral, saveReferral, type MyReferral, type RewardOffer, buildReferralShareMessage, buildReferralShareTitle, referralHelpText } from "@/lib/rewards";
import { userInitials, welcomeName } from "@/lib/userDisplay";

let ctx: ContractApp;
let restoreFetch: () => void;
let authBase = "";
let authServer: import("http").Server;
const session: Record<string, any> = {};

beforeAll(async () => {
  ctx = await bootContractApp();
  restoreFetch = routeBrowserFetchTo(ctx.base);
  const { registerAuthRoutes } = await import("../../../../server/auth");
  const e = express();
  e.use(express.json());
  e.use((req, _res, next) => { (req as any).session = session; next(); });
  registerAuthRoutes(e);
  authServer = e.listen(0, "127.0.0.1");
  await new Promise((r) => authServer.once("listening", r));
  authBase = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
});
afterAll(async () => { restoreFetch(); authServer.close(); await ctx.close(); });
beforeEach(async () => {
  await resetContractApp(ctx);
  toast.mockClear();
  try { localStorage.clear(); } catch { /* ignore */ }
  for (const k of Object.keys(session)) delete session[k];
});
afterEach(() => { vi.restoreAllMocks(); delete process.env.REFERRAL_RETRY_DELAYS_MS; });

const referralCalls = (userId?: string) => ctx.stub.to("/api/referral/referrals").filter((c) => !userId || c.body?.referee?.id === userId);
async function newUser() {
  return ctx.storage.createAuthUser({
    email: `ref${Math.random().toString(36).slice(2, 8)}@example.com`, accountType: "individual", country: "GB",
    firstName: "Mohammad", lastName: "Khan", password: "x", status: "active",
  } as any);
}
async function authApi(path: string, body: unknown) {
  const res = await fetch(`${authBase}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const OFFER: RewardOffer = {
  rule_id: 1, currency: "GBP", reward_type: "BOTH", referrer_reward: 5, referee_reward: 10, floor: 50, qualification_window_days: 30,
  bonus_validity_days: 90, min_redeem_amount: 0,
  text: "Invite friends with your link. You get £5.00 and your friend gets £10.00 in bonus credit when they send £50.00 or more within 30 days of joining.",
  referral_code: "JOHN2880", referral_link: "http://localhost:5000/ref/JOHN2880", cap_reached: false,
};
const FRIENDS: MyReferral[] = ["Musa I.", "Kemi L.", "Sarah S."].map((friend, i) => ({
  id: `R${i}`, friend, joined_on: "2026-09-20T10:00:00Z", status: i === 2 ? "REWARDED" : "REGISTERED", status_label: "x", currency: "GBP", floor: 50, qualification_deadline: "2027-01-01", reward: 5, credited: i === 2 ? 5 : 0,
}));
const card = (over: Record<string, unknown> = {}) => render(React.createElement(ReferEarnCard, {
  offer: OFFER, referrals: FRIENDS, summary: { joined: 3, earned_count: 1, total_earned: { GBP: 5 } }, isLoading: false, isError: false, onRetry: () => {}, ...over,
} as any));

describe("Capturing the referral code", () => {
  async function openLanding(code: string, waitForRedirect = true) {
    const { hook, history } = memoryLocation({ path: `/ref/${code}`, record: true });
    const view = render(React.createElement(Router, { hook }, React.createElement(Route, { path: "/ref/:code", component: ReferralLanding })));
    if (waitForRedirect) {
      await waitFor(() => expect(history.some((p) => p.includes("/sign-in-sign-up"))).toBe(true), { timeout: 3000 });
    }
    return { view, history };
  }

  rule("REF-01", "A /ref/:code link is validated with Mito, the visit is counted, the code is remembered in the browser, desktop redirects straight to sign-up, and Android/iOS show only their own platform option", {
    why: "The referral is only credited if the new customer's code survives from the link click to email verification; desktop users go straight to email entry while Android and iOS users see only their device's app option.",
    fix: "pages/ReferralLanding.tsx: GET /api/rewards/codes/:code -> saveReferral({ code, referrerFirstName, offer }) (localStorage 'rhemito.referral'), POST /api/rewards/visits with the visitor id; on desktop (operatingSystem === 'Other') redirect straight to /sign-in-sign-up?mode=signup; on Android render only android-download-panel + Continue on Website; on iOS render only ios-download-panel + Continue on Website. Codes must match REFERRAL_CODE_RE (6-16 letters/digits).",
    where: ["client/src/pages/ReferralLanding.tsx", "client/src/lib/rewards.ts", "server/rewardsRoutes.ts"],
    timeout: 10_000,
  }, async () => {
    expect(REFERRAL_CODE_RE.test("JOHN2880")).toBe(true);
    expect(REFERRAL_CODE_RE.test("AB-12")).toBe(false);
    ctx.stub.on("/api/referral/codes/JOHN2880", { status: 200, body: { code: "JOHN2880", referrer_first_name: "John", offer: OFFER } });

    // 1. Desktop (default user-agent) redirects straight to /sign-in-sign-up?mode=signup
    const desktop = await openLanding("john2880", true);
    const stored = JSON.parse(localStorage.getItem("rhemito.referral")!);
    expect(stored).toMatchObject({ code: "JOHN2880", referrerFirstName: "John", channel: "WEB" });
    await waitFor(() => expect(ctx.stub.to("/api/referral/visits")).toHaveLength(1));
    expect(ctx.stub.to("/api/referral/visits")[0].body).toMatchObject({ code: "JOHN2880" });
    expect(desktop.history[desktop.history.length - 1]).toContain("/sign-in-sign-up?mode=signup");
    desktop.view.unmount();

    // 2. Android user-agent sees only Android panel (no iOS option, no tracking badge)
    const origUa = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      configurable: true,
    });
    try {
      const android = await openLanding("john2880", false);
      await waitFor(() => expect(android.view.getByTestId("referral-landing-page")).toBeTruthy(), { timeout: 3000 });
      expect(android.view.getByTestId("referral-landing-heading").textContent).toContain("Good things start");
      expect(android.view.getByTestId("referral-landing-code").textContent).toBe("JOHN2880");
      expect(android.view.queryByTestId("referral-tracking-badge")).toBeNull();
      expect(android.view.getByTestId("android-download-panel")).toBeTruthy();
      expect(android.view.getByTestId("download-android-playstore-btn").textContent).toContain("Get Rhemito on Google Play");
      expect(android.view.queryByTestId("ios-download-panel")).toBeNull();
      android.view.unmount();

      // 3. iOS user-agent sees only iOS panel (no Android option)
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        configurable: true,
      });
      const ios = await openLanding("john2880", false);
      await waitFor(() => expect(ios.view.getByTestId("referral-landing-page")).toBeTruthy(), { timeout: 3000 });
      expect(ios.view.getByTestId("ios-download-panel")).toBeTruthy();
      expect(ios.view.getByTestId("referral-copy-code-btn")).toBeTruthy();
      expect(ios.view.getByTestId("ios-option-b-appstore-btn").textContent).toContain("Download on the App Store");
      expect(ios.view.queryByTestId("android-download-panel")).toBeNull();
      ios.view.unmount();
    } finally {
      Object.defineProperty(navigator, "userAgent", { value: origUa, configurable: true });
    }
  });

  rule("REF-02", "A malformed or refused referral link does not keep a code: sign-up still opens with a friendly message", {
    why: "A bad link must never block sign-up, and a code Mito says is invalid must not be sent on registration.",
    fix: "ReferralLanding: format check first (clearReferral + toast \"This referral link isn't valid\" + open sign-up); a non-OK answer from /api/rewards/codes also clears the stored code and shows the toast (a different title when the referrer is inactive).",
    where: ["client/src/pages/ReferralLanding.tsx"],
    timeout: 10_000,
  }, async () => {
    saveReferral({ code: "OLDCODE1" });
    const bad = await openLanding("AB-12");
    expect(localStorage.getItem("rhemito.referral")).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "This referral link isn't valid" }));
    bad.view.unmount();

    toast.mockClear();
    ctx.stub.on("/api/referral/codes/NOSUCH12", { status: 404, body: { error: "INVALID_CODE", message: "No such code" } });
    const refused = await openLanding("NOSUCH12");
    expect(localStorage.getItem("rhemito.referral")).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "This referral link isn't valid" }));
    refused.view.unmount();
  });

  rule("REF-03", "Referral links are for new customers only: an existing/signed-in visitor is told so in a friendly British way, sees existing-user offers, and nothing is stored", {
    why: "An existing customer opening a friend's link cannot be referred; storing the code could attach it to a later business sign-up. Instead of a dead-end redirect, the page tells them clearly in a British tone that the welcome offer is for new users only and shows the offers available for existing customers (Refer & Earn, Bonus Schemes, Promo Codes) across Web, Android, and iOS.",
    fix: "ReferralLanding & ExistingUserReferralCard: when body.data.signedIn is true (or ?existing=1), toast 'Referral links are for new customers only', call clearReferral() (do not call saveReferral), and render ExistingUserReferralCard showing existing-user offers and how to benefit from each.",
    where: ["client/src/pages/ReferralLanding.tsx", "client/src/components/rewards/ExistingUserReferralCard.tsx", "server/rewardsRoutes.ts"],
  }, async () => {
    const real = globalThis.fetch;
    globalThis.fetch = ((u: any, init?: any) => {
      if (String(u).includes("/api/rewards/codes/")) {
        return Promise.resolve(new Response(JSON.stringify({ data: { code: "JOHN2880", referrerFirstName: "John", offer: OFFER, signedIn: true } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      if (String(u).includes("/api/rewards/existing-user-offers")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: {
            signedIn: true,
            currency: "GBP",
            viewerFirstName: "Sarah",
            viewerReferralCode: "SARAH100",
            viewerReferralLink: "http://localhost:5000/ref/SARAH100",
            referralOffer: OFFER,
            referralOffers: [OFFER],
            bonusOffers: [{ id: 1, name: "GBP Loyalty Bonus", type: "LOYALTY_CREDIT", currency: "GBP", summary: "Complete 3 transfers within 30 days and get £10.00 bonus credit." }],
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return real(u, init);
    }) as typeof fetch;
    try {
      const { hook } = memoryLocation({ path: "/ref/JOHN2880", record: true });
      const view = render(React.createElement(Router, { hook }, React.createElement(Route, { path: "/ref/:code", component: ReferralLanding })));
      await waitFor(() => expect(view.getByTestId("existing-user-referral-view")).toBeTruthy(), { timeout: 3000 });
      expect(toast).toHaveBeenCalledWith({ title: "Referral links are for new customers only" });
      expect(localStorage.getItem("rhemito.referral")).toBeNull();
      expect(view.getByTestId("existing-user-heading").textContent).toContain("Lovely to see you again");
      expect(view.getByTestId("existing-user-explanation").textContent).toContain("exclusively for new users");
      expect(view.getByTestId("existing-offer-refer-earn")).toBeTruthy();
      expect(view.getByTestId("existing-offer-bonus-schemes")).toBeTruthy();
      expect(view.getByTestId("existing-offer-promo-codes")).toBeTruthy();
      view.unmount();
    } finally {
      globalThis.fetch = real;
    }
    expect(source("server/rewardsRoutes.ts")).toMatch(/signedIn: Boolean\(req\.session\?\.userId\)/);
  });

  rule("REF-04", "The captured code is kept for 30 days, then dropped", {
    why: "The invitation should still count if the friend signs up within a month, but stale codes must not attach to unrelated sign-ups later.",
    fix: "lib/rewards.ts: saveReferral stores { code, referrerFirstName, offer, savedAt } under 'rhemito.referral'; loadReferral returns null (and removes it) when older than REF_TTL_MS = 30 days.",
    where: ["client/src/lib/rewards.ts"],
  }, () => {
    const t0 = Date.UTC(2026, 9, 1);
    saveReferral({ code: "JOHN2880", referrerFirstName: "John" }, t0);
    expect(loadReferral(t0 + 29 * 86_400_000)?.code).toBe("JOHN2880");
    expect(loadReferral(t0 + 31 * 86_400_000)).toBeNull();
    expect(localStorage.getItem("rhemito.referral")).toBeNull();
    saveReferral({ code: "JOHN2880" });
    clearReferral();
    expect(loadReferral()).toBeNull();
  });

  rule("REF-21", "An applied referral code on Sign-Up is strictly read-only for the referee (no 'Remove' button), while an unverified 503 manual entry stays editable", {
    why: "Product rule (approved by Mohammad, 2026-11-16): referees must not be able to remove an applied referral code on Sign-Up, whether pre-populated via a /ref/:code link or validated via manual entry; however, if Mito is temporarily down (503) during manual typing, the input stays editable so a typo cannot permanently lock the field.",
    fix: "ReferralCodeField in components/rewards/ReferralSignup.tsx renders data-testid='referral-code-applied' (role='status') without any 'Remove' button when referral is verified/link-attributed, and keeps #referral-code editable when unverifiedFallback is active on a 503 response.",
    where: ["client/src/components/rewards/ReferralSignup.tsx", "client/src/pages/Auth/components/SignUpForm.tsx"],
  }, async () => {
    // 1. Pre-populated from /ref/:code link: read-only chip, no Remove button
    const onChange = vi.fn();
    const linked = render(
      React.createElement(ReferralCodeField, {
        referral: { code: "JOHN5054GBP", referrerFirstName: "John", channel: "WEB", offer: OFFER, savedAt: Date.now() },
        onChange,
      }),
    );
    const applied = linked.getByTestId("referral-code-applied");
    expect(applied.getAttribute("role")).toBe("status");
    expect(applied.textContent).toContain("Referral code JOHN5054GBP");
    expect(applied.textContent).toContain("Code applied – invited by John");
    expect(linked.queryByRole("button", { name: /remove/i })).toBeNull();
    linked.unmount();

    // 2. Manual entry: 503 keeps input editable, then 404 clears fallback, then 200 locks chip with no Remove button
    function Wrapper() {
      const [ref, setRef] = React.useState<any>(null);
      return React.createElement(ReferralCodeField, { referral: ref, onChange: setRef });
    }
    const manual = render(React.createElement(Wrapper));
    fireEvent.click(manual.getByRole("button", { name: "Have a referral code?" }));
    const input = manual.container.querySelector("#referral-code") as HTMLInputElement;
    expect(input).toBeTruthy();

    // 503 during manual typing -> stays editable (not locked into referral-code-applied)
    ctx.stub.on("/api/referral/codes/TYPO1234", { status: 503, body: { error: "DOWN" } });
    fireEvent.change(input, { target: { value: "typo1234" } });
    await act(async () => { fireEvent.blur(input); });
    await waitFor(() => expect(loadReferral()?.code).toBe("TYPO1234"));
    expect(manual.queryByTestId("referral-code-applied")).toBeNull();

    // Clearing the 503 typo clears storage
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => { fireEvent.blur(input); });
    expect(loadReferral()).toBeNull();

    // Valid code -> locks into read-only referral-code-applied with NO Remove button
    ctx.stub.on("/api/referral/codes/JOHN2880", { status: 200, body: { code: "JOHN2880", referrer_first_name: "John", offer: OFFER } });
    fireEvent.change(input, { target: { value: "john2880" } });
    await act(async () => { fireEvent.blur(input); });
    await waitFor(() => expect(manual.getByTestId("referral-code-applied")).toBeTruthy());
    expect(manual.getByTestId("referral-code-applied").textContent).toContain("Referral code JOHN2880");
    expect(manual.queryByRole("button", { name: /remove/i })).toBeNull();
    manual.unmount();
  });
});

describe("Recording the referral", () => {
  rule("REF-05", "The code travels with the registration, but the referral is recorded at EMAIL VERIFICATION (not at registration), and the browser forgets the code afterwards", {
    why: "A referral must only exist for a real, verified customer; sign-ups with unverified emails must not create referrals or notify the referrer.",
    fix: "Browser: SignUpForm / BusinessStep2 send referralCode from the stored referral; OtpStep calls clearReferral() after verify-otp succeeds. Server (server/auth.ts): register validates the code format, holds it in pendingReferralCodes by email, and POST /api/auth/verify-otp calls onCustomerVerified(user.id, pendingCode).",
    where: ["server/auth.ts", "client/src/pages/Auth/components/SignUpForm.tsx", "client/src/pages/Auth/components/BusinessStep2.tsx", "client/src/pages/Auth/components/OtpStep.tsx", "server/rewardsService.ts"],
    timeout: 15_000,
  }, async () => {
    expect(source("client/src/pages/Auth/components/SignUpForm.tsx")).toContain("referralCode: referral?.code");
    expect(source("client/src/pages/Auth/components/BusinessStep2.tsx")).toContain("referralCode: loadReferral()?.code");
    expect(source("client/src/pages/Auth/components/OtpStep.tsx")).toMatch(/onSuccess:[\s\S]*clearReferral\(\)/);

    const email = `friend${Math.random().toString(36).slice(2, 8)}@example.com`;
    const bad = await authApi("/api/auth/register", { email: "x@example.com", password: "Passw0rd!x", confirmPassword: "Passw0rd!x", referralCode: "AB-12" });
    expect(bad.status).toBe(400);

    const reg = await authApi("/api/auth/register", { email, accountType: "individual", country: "GB", firstName: "Fatima", lastName: "Ali", password: "Passw0rd!xx", confirmPassword: "Passw0rd!xx", referralCode: "john2880" });
    expect(reg.status).toBe(200);
    await wait(150);
    expect(referralCalls()).toHaveLength(0); // not recorded at registration

    const verified = await authApi("/api/auth/verify-otp", { email, code: "123456" });
    expect(verified.status).toBe(200);
    await waitFor(() => expect(referralCalls()).toHaveLength(1), { timeout: 3000 });
    const user = await ctx.storage.getAuthUserByEmail(email);
    expect(referralCalls()[0].body).toEqual({ code: "JOHN2880", referee: { id: user!.id, send_currency: "GBP" } });
  });

  rule("REF-06", "On verification the customer is synced to Mito FIRST, then the referral is recorded with the code and the friend's send currency; no code means sync only", {
    why: "Mito must know the friend (country, currency, device) before it can create and judge the referral.",
    fix: "rewardsService.onCustomerVerified: await syncCustomer(userId) (POST /api/referral/customers) then recordReferral (POST /api/referral/referrals { code, referee: { id, send_currency } }); returns null and never throws.",
    where: ["server/rewardsService.ts"],
  }, async () => {
    const u = await newUser();
    await ctx.rewards.onCustomerVerified(u.id, "JOHN2880");
    const order = ctx.stub.calls.map((c) => c.path.split("?")[0]).filter((p) => p.startsWith("/api/referral/"));
    expect(order).toEqual(["/api/referral/customers", "/api/referral/referrals"]);
    expect(ctx.stub.to("/api/referral/customers")[0].body).toMatchObject({ id: u.id, email: u.email, country: "GB", send_currency: "GBP" });
    expect(referralCalls()[0].body).toEqual({ code: "JOHN2880", referee: { id: u.id, send_currency: "GBP" } });

    ctx.stub.reset();
    expect(await ctx.rewards.onCustomerVerified(u.id, null)).toBeNull();
    expect(referralCalls()).toHaveLength(0);
    expect(ctx.stub.to("/api/referral/customers")).toHaveLength(1);
  });

  rule("REF-07", "A temporary Mito failure (5xx or unreachable) is retried in the background with the delays 10 s, 30 s, 2 min, 5 min, 15 min; a refusal (4xx) is not retried", {
    why: "Mito may be asleep or restarting at the moment a friend verifies. Retrying later keeps the referral; retrying a refusal (bad code, self-referral) would never succeed.",
    fix: "rewardsService.ts: referralRetryDelays() defaults to REFERRAL_RETRY_DELAYS_MS ?? '10000,30000,120000,300000,900000'; isTemporary(err) = RewardsError with status >= 500 (the unreachable case is a 503); scheduleReferralRetry re-syncs the customer and records again, and gives up after the last delay.",
    where: ["server/rewardsService.ts"],
    timeout: 10_000,
  }, async () => {
    expect(source("server/rewardsService.ts")).toContain('process.env.REFERRAL_RETRY_DELAYS_MS ?? "10000,30000,120000,300000,900000"');
    process.env.REFERRAL_RETRY_DELAYS_MS = "30,30,30";

    // 500 twice, then success: three attempts in total, sign-up itself returns immediately
    const u = await newUser();
    const replies = [{ status: 500, body: { error: "BOOM" } }, { status: 503, body: { error: "DOWN" } }];
    ctx.stub.on("/api/referral/referrals", () => replies.shift() ?? { status: 200, body: { data: { status: "REGISTERED", referrer_id: "nobody", reward_type: "BOTH", referrer_reward: 5, currency: "GBP", floor: 50 } } });
    expect(await ctx.rewards.onCustomerVerified(u.id, "JOHN2880")).toBeNull();
    await wait(400);
    expect(referralCalls(u.id)).toHaveLength(3);
    expect(ctx.stub.to("/api/referral/customers").filter((c) => c.body.id === u.id).length).toBeGreaterThanOrEqual(3); // re-synced before each retry

    // always failing: first try + 3 retries, then it gives up
    ctx.stub.reset();
    const v = await newUser();
    ctx.stub.on("/api/referral/referrals", { status: 503, body: { error: "DOWN" } });
    await ctx.rewards.onCustomerVerified(v.id, "JOHN2880");
    await wait(400);
    expect(referralCalls(v.id)).toHaveLength(4);

    // a refusal is final
    ctx.stub.reset();
    const w = await newUser();
    ctx.stub.on("/api/referral/referrals", { status: 404, body: { error: "INVALID_CODE", message: "no such code" } });
    await ctx.rewards.onCustomerVerified(w.id, "NOSUCH12");
    await wait(200);
    expect(referralCalls(w.id)).toHaveLength(1);
  });

  rule("REF-08", "NEGATIVE (fixed bug): referral recording survives Mito being completely down when the friend verifies", {
    why: "Mito (on a free host) was asleep when friends verified their email; the referral was lost and the referrer never got their reward. The unreachable case must be treated as temporary and retried.",
    fix: "mito() in rewardsService.ts turns a network failure into RewardsError(503, 'REWARDS_UNAVAILABLE'); onCustomerVerified catches it and, because isTemporary() is true, calls scheduleReferralRetry. Do not rethrow, and do not treat 503 as final.",
    where: ["server/rewardsService.ts"],
    timeout: 10_000,
  }, async () => {
    process.env.REFERRAL_RETRY_DELAYS_MS = "50,50,50,50";
    const u = await newUser();
    ctx.stub.on(/^\/api\/referral\//, "drop"); // connection dies: Mito unreachable
    const first = await ctx.rewards.onCustomerVerified(u.id, "JOHN2880");
    expect(first).toBeNull(); // verification itself is not held up or failed
    ctx.stub.reset(); // Mito wakes up
    await waitFor(() => expect(referralCalls(u.id).length).toBeGreaterThanOrEqual(1), { timeout: 3000 });
    expect(referralCalls(u.id)[0].body.code).toBe("JOHN2880");
  });

  rule("REF-09", "Self-referral is NOT decided by Rhemito: whatever Mito answers is passed on, a refusal ends quietly, and Rhemito sends the facts Mito needs (device id when known)", {
    why: "Eligibility (self-referral, duplicate accounts, caps) is a Mito business rule. Duplicating it in Rhemito would let the two disagree.",
    fix: "rewardsService.onCustomerVerified forwards the code and never compares referrer and referee itself. A 4xx from Mito (e.g. 409 SELF_REFERRAL) is logged, returns null and is not retried. syncCustomer sends device_id (hashed, from deviceForUser) only when known.",
    where: ["server/rewardsService.ts", "server/deviceId.ts"],
  }, async () => {
    const u = await newUser();
    ctx.stub.on("/api/referral/referrals", { status: 409, body: { error: "SELF_REFERRAL", message: "You can't refer yourself." } });
    expect(await ctx.rewards.onCustomerVerified(u.id, "JOHN2880")).toBeNull();
    expect(referralCalls(u.id)).toHaveLength(1);
    const text = source("server/rewardsService.ts");
    expect(text).not.toMatch(/referrer_id\s*===\s*(userId|referee)|self.?referral/i);
    expect(text).toContain("device_id: deviceForUser(user.id) ?? undefined");
  });

  rule("REF-10", "Transfer events are reported to Mito's referral engine with the corridor, and a Mito failure never breaks the transfer", {
    why: "The referral reward is released by the friend's first qualifying transfer; Mito also needs the receive currency because rules can be tied to a corridor.",
    fix: "rewardsService.onTransferEvent posts { transfer_id, customer_id, amount, currency, receive_currency, status, created_at } to /api/referral/transfer-events after syncing the customer, and catches every error.",
    where: ["server/rewardsService.ts", "server/sendMoneyRoutes.ts"],
  }, async () => {
    const u = await newUser();
    const tx = { reference: "TXN-1", sendAmount: 100, sendCurrency: "GBP", receiveCurrency: "NGN", createdAt: new Date("2026-10-01T10:00:00Z") };
    await ctx.rewards.onTransferEvent(u.id, tx, "COMPLETED");
    expect(ctx.stub.to("/api/referral/transfer-events")[0].body).toEqual({
      transfer_id: "TXN-1", customer_id: u.id, amount: 100, currency: "GBP", receive_currency: "NGN", status: "COMPLETED", created_at: "2026-10-01T10:00:00.000Z",
    });
    ctx.stub.on(/^\/api\/referral\//, "drop");
    await expect(ctx.rewards.onTransferEvent(u.id, tx, "COMPLETED")).resolves.toBeUndefined();
  });

  rule("REF-22", "NEGATIVE (fixed bug): referee transfer events survive Mito cold-starts in strict PAID -> COMPLETED order to award the referrer, and non-test TXN sequences never recycle TXN-YYYYMM-00001 across restarts", {
    why: "Referrers missed earned rewards when (a) Mito was asleep/503 during a referee's payment because onTransferEvent had no retry, and (b) container restarts reset MemStorage.sendMoneySequence to 0, recycling TXN-YYYYMM-00001 across different referees.",
    fix: "rewardsService.onTransferEvent queues temporary 5xx/unreachable failures per transfer using referralRetryDelays() so PAID delivers before COMPLETED once Mito wakes up and notifies the referrer; MemStorage initializes sendMoneySequence from monotonicSendMoneyFloor() when NODE_ENV !== 'test', persists sendMoneyTransactions + sequences.sendMoney in devPersistence.ts, and useRewards() sets refetchOnWindowFocus: true.",
    where: ["server/rewardsService.ts", "server/storage.ts", "server/devPersistence.ts", "client/src/hooks/use-rewards.ts"],
    timeout: 10_000,
  }, async () => {
    process.env.REFERRAL_RETRY_DELAYS_MS = "40,40,40";
    const referrer = await newUser();
    const referee = await newUser();
    const tx = {
      reference: "TXN-202611-90001",
      sendAmount: 60,
      sendCurrency: "GBP",
      receiveCurrency: "USD",
      createdAt: new Date("2026-11-16T09:00:00Z"),
    };

    // 1. Mito drops connection then returns 503 while referee pays; once awake, PAID then COMPLETED arrive in strict order
    let transferAttempts = 0;
    const deliveredStatuses: string[] = [];
    ctx.stub.on("/api/referral/transfer-events", (call) => {
      transferAttempts += 1;
      if (transferAttempts === 1) return "drop";
      if (transferAttempts === 2) return { status: 503, body: { error: "WAKING_UP" } };
      deliveredStatuses.push(call.body.status);
      if (call.body.status === "PAID") {
        return {
          status: 200,
          body: {
            referral: {
              id: "REF-WAKE1",
              referrer_id: referrer.id,
              referee_id: referee.id,
              status: "PENDING",
              currency: "GBP",
              referrer_credited: 0,
              referee_credited: 10,
              bonus_validity_days: 90,
            },
          },
        };
      }
      return {
        status: 200,
        body: {
          referral: {
            id: "REF-WAKE1",
            referrer_id: referrer.id,
            referee_id: referee.id,
            status: "REWARDED",
            currency: "GBP",
            referrer_credited: 5,
            referee_credited: 10,
            bonus_validity_days: 90,
          },
        },
      };
    });

    await expect(
      ctx.rewards.onTransferEvent(referee.id, tx, "PAID").then(() => ctx.rewards.onTransferEvent(referee.id, tx, "COMPLETED")),
    ).resolves.toBeUndefined();

    await waitFor(() => expect(deliveredStatuses).toEqual(["PAID", "COMPLETED"]), { timeout: 3000 });
    const { getActiveNotifications } = await import("../../../../server/notificationService");
    await waitFor(async () => {
      const notes = await getActiveNotifications(referrer.id);
      expect(notes.some((n) => n.type === "reward_earned" && String(n.body ?? n.title ?? "").includes("£5.00"))).toBe(true);
    }, { timeout: 2000 });

    // 4xx refusal on transfer-events is permanent (not retried endlessly)
    ctx.stub.reset();
    ctx.stub.on("/api/referral/transfer-events", { status: 400, body: { error: "BAD_EVENT" } });
    await ctx.rewards.onTransferEvent(referee.id, { ...tx, reference: "TXN-BAD-400" }, "COMPLETED");
    await wait(160);
    expect(ctx.stub.to("/api/referral/transfer-events")).toHaveLength(1);

    // 2. Non-test MemStorage restarts advance monotonically and never recycle TXN-YYYYMM-00001
    const { MemStorage, monotonicSendMoneyFloor } = await import("../../../../server/storage");
    const { formatDocumentNumber } = await import("@shared/invoice-logic");

    // NODE_ENV === "test" stays deterministic starting at 1
    const testStore = new MemStorage();
    expect(await testStore.nextSendMoneySequence()).toBe(1);

    const t1 = new Date("2026-11-16T07:20:00.000Z");
    const t2 = new Date("2026-11-16T08:26:00.000Z");
    expect(monotonicSendMoneyFloor(t1, "production")).toBeGreaterThan(1);
    expect(monotonicSendMoneyFloor(t2, "production")).toBeGreaterThan(monotonicSendMoneyFloor(t1, "production"));

    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const boot1 = new MemStorage();
      const seq1 = await boot1.nextSendMoneySequence();
      expect(seq1).toBeGreaterThan(1);
      expect(formatDocumentNumber("TXN", seq1, "2026-11")).not.toBe("TXN-202611-00001");

      await wait(130);
      const boot2 = new MemStorage();
      const seq2 = await boot2.nextSendMoneySequence();
      expect(seq2).toBeGreaterThan(seq1);

      boot2.hydrateForDev([], [], [], [], [], [], [], [], [], [], { sendMoney: seq2 + 250 }, [
        {
          id: "persisted-txn-1",
          ownerId: referee.id,
          reference: formatDocumentNumber("TXN", seq2 + 250, "2026-11"),
          recipientName: "Jane Roe",
          service: "bank_deposit",
          paymentMethod: "card",
          sendCurrency: "GBP",
          sendAmountMinor: 5000,
          receiveCurrency: "USD",
          receiveAmountMinor: 6300,
          feeMinor: 100,
          exchangeRate: "1.26",
          promoCode: null,
          status: "completed",
          createdAt: new Date(),
          paidAt: new Date(),
          cancelledAt: null,
        },
      ]);
      expect((await boot2.getSendMoneyTransactionById("persisted-txn-1"))?.reference).toBe(
        formatDocumentNumber("TXN", seq2 + 250, "2026-11"),
      );
      expect(await boot2.nextSendMoneySequence()).toBeGreaterThan(seq2 + 250);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // 3. Referrer tab revalidates rewards on window focus
    expect(source("client/src/hooks/use-rewards.ts")).toContain("refetchOnWindowFocus: true");
  });

  rule("REF-11", "The referral link is built from Rhemito's own public URL: <publicBaseUrl>/ref/<CODE>, whatever link Mito sends", {
    why: "Links must work in every environment (local, staging, production). Mito does not know Rhemito's address.",
    fix: "server/rewardsRoutes.ts GET /api/rewards/summary overwrites offer.referral_link with `${serverConfig.publicBaseUrl without trailing slash}/ref/${offer.referral_code}`. The Refer card shows it without the http(s):// prefix.",
    where: ["server/rewardsRoutes.ts", "server/config.ts", "client/src/components/rewards/ReferEarnCard.tsx"],
  }, async () => {
    const { serverConfig } = await import("../../../../server/config");
    ctx.stub.on(/^\/api\/referral\/offer\?/, { status: 200, body: { offer: { ...OFFER, referral_link: "https://mito.example/wrong" } } });
    const r = await ctx.api("GET", "/api/rewards/summary");
    expect(r.status).toBe(200);
    expect(r.body.data.offer.referral_link).toBe(`${serverConfig.publicBaseUrl.replace(/\/+$/, "")}/ref/JOHN2880`);
    expect(r.body.data.referrals.summary).toEqual({ joined: 0, earned_count: 0, total_earned: {} });

    const view = card({ offer: { ...OFFER, referral_link: "https://app.rhemito.com/ref/JOHN2880" } });
    expect((view.getByLabelText("Your referral link") as HTMLInputElement).value).toBe("app.rhemito.com/ref/JOHN2880");
    view.unmount();
  });

  rule("REF-12", "Friends are shown by first name + last initial only ('Sarah S.')", {
    why: "Privacy: the referrer sees who joined without learning the friend's full name.",
    fix: "rewardsService.maskName(first, last) -> `${first || 'Your friend'} ${lastInitial}.` and Mito's referrals list uses the same style.",
    where: ["server/rewardsService.ts"],
  }, () => {
    expect(ctx.rewards.maskName("Sarah", "Smith")).toBe("Sarah S.");
    expect(ctx.rewards.maskName("Sarah", null)).toBe("Sarah");
    expect(ctx.rewards.maskName(null, "Smith")).toBe("Your friend S.");
  });
});

describe("Refer & Earn card", () => {
  rule("REF-13", "The card shows the friends-joined count and total bonus earned, plus a 'View all referrals' link; it NEVER lists individual friends", {
    why: "The Dashboard card must stay the same height however many friends join, and friends' names belong on the Referrals tab of Bonus & Discounts, not on the Dashboard.",
    fix: "components/rewards/ReferEarnCard.tsx renders only totals from `summary` (joined, earned_count, total_earned) and a Link to /bonus-discounts?tab=referrals. Do not map over `referrals` to render rows here.",
    where: ["client/src/components/rewards/ReferEarnCard.tsx", "client/src/pages/BonusAndDiscounts.tsx"],
  }, () => {
    const view = card();
    expect(view.getByTestId("refer-count").textContent).toBe("3");
    expect(view.getByTestId("refer-earned").textContent).toBe("£5.00");
    expect(view.getByTestId("refer-waiting").textContent).toBe("2 friends are yet to send £50.00+");
    const link = view.getByRole("link", { name: /View all referrals/ });
    expect(link.getAttribute("href")).toBe("/bonus-discounts?tab=referrals");
    for (const f of FRIENDS) expect(view.queryByText(f.friend)).toBeNull();
    expect(view.container.textContent).not.toMatch(/Musa|Kemi|Sarah/);
    view.unmount();
    // totals come from the summary, not from counting rows; several currencies are joined with ' + '
    const multi = card({ referrals: [], summary: { joined: 10, earned_count: 4, total_earned: { GBP: 20, USD: 5, EUR: 0 } } });
    expect(multi.getByTestId("refer-count").textContent).toBe("10");
    expect(multi.getByTestId("refer-earned").textContent).toBe("£20.00 + $5.00");
    multi.unmount();
    const none = card({ referrals: [], summary: { joined: 0, earned_count: 0, total_earned: {} } });
    expect(none.getByText("No referrals yet. Share your link to start earning.")).toBeTruthy();
    expect(none.queryByRole("link", { name: /View all referrals/ })).toBeNull();
    none.unmount();
  });

  rule("REF-14", "The offer sentence shows every money amount in bold, and only the selected rule is displayed with a currency hint", {
    why: "Customers scan the card for what they and their friend get; showing only the selected rule keeps the card clean while the header hint guides them to click currencies.",
    fix: "ReferEarnCard.OfferSentence splits the offer text on currency amounts (£ $ € ₦ ₹ ¥ A$ C$ R KSh GH₵ AED) and wraps each in <strong>. When multiple currencies apply, refer-currency-hint prompts the user to click a currency to see its rewards.",
    where: ["client/src/components/rewards/ReferEarnCard.tsx"],
  }, () => {
    const view = card();
    const bold = Array.from(view.getByTestId("refer-offer-text").querySelectorAll("strong")).map((s) => s.textContent);
    expect(bold).toEqual(["£5.00", "£10.00", "£50.00"]);
    expect(view.getByTestId("refer-offer-text").textContent).toBe(OFFER.text);
    view.unmount();
    const usdOffer = { ...OFFER, rule_id: 2, currency: "USD", text: "You get $10.00 and your friend gets $20.00 in bonus credit when they send $100.00 or more." };
    const multiCur = card({ offer: OFFER, offers: [OFFER, usdOffer], sendCurrencies: ["GBP", "USD", "EUR"] });
    expect(multiCur.getByTestId("refer-corridor-pills").textContent).toBe("GBP → ALLUSD → ALL");
    expect(multiCur.queryByTestId("refer-send-currencies")).toBeNull();
    expect(multiCur.getByTestId("refer-currency-hint").textContent).toContain("Click a currency");
    expect(multiCur.queryByTestId("refer-currency-offers")).toBeNull();
    fireEvent.click(multiCur.getByRole("button", { name: "USD → ALL" }));
    expect(multiCur.getByTestId("refer-offer-text").textContent).toBe(usdOffer.text);
    multiCur.unmount();
    const ngn = card({ offer: { ...OFFER, text: "You get ₦2,500.00 when they send ₦25,000.00 or more." } });
    expect(Array.from(ngn.getByTestId("refer-offer-text").querySelectorAll("strong")).map((s) => s.textContent)).toEqual(["₦2,500.00", "₦25,000.00"]);
    ngn.unmount();
  });

  rule("REF-15", "The card is hidden when there is no offer, shows a retry state on error (not a blank), and a cap-reached message instead of the link", {
    why: "No active rule for the customer's currency means nothing to promote. A failed load must be recoverable. When the reward cap is reached a link would promise rewards that will not come.",
    fix: "ReferEarnCard: isLoading -> skeleton (data-testid refer-earn-loading); isError -> role=alert message \"We couldn't load your referral details...\" with a 'Try again' button calling onRetry; !offer -> null; offer.cap_reached -> message and no link field.",
    where: ["client/src/components/rewards/ReferEarnCard.tsx"],
  }, () => {
    const hidden = card({ offer: null });
    expect(hidden.container.innerHTML).toBe("");
    hidden.unmount();

    const onRetry = vi.fn();
    const err = card({ isError: true, onRetry });
    expect(err.getByTestId("refer-earn-error").textContent).toContain("We couldn't load your referral details.");
    expect(err.getByRole("alert")).toBeTruthy();
    fireEvent.click(err.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    err.unmount();

    expect(card({ isLoading: true }).getByTestId("refer-earn-loading")).toBeTruthy();

    const capped = card({ offer: { ...OFFER, cap_reached: true } });
    expect(capped.getByTestId("refer-cap-reached")).toBeTruthy();
    expect(capped.queryByLabelText("Your referral link")).toBeNull();
    capped.unmount();
  });

  rule("REF-16", "Copy link copies the full link and confirms with a toast; if copying fails the customer is told to copy manually", {
    why: "Every submission or action needs visible feedback (project rule), and a silent copy failure would leave the customer sharing nothing.",
    fix: "ReferEarnCard.handleCopy: navigator.clipboard.writeText(link) -> toast 'Referral link copied!'; on error -> destructive toast \"We couldn't copy the link\" and the input is selected.",
    where: ["client/src/components/rewards/ReferEarnCard.tsx"],
  }, async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const view = card();
    await act(async () => { fireEvent.click(view.getByRole("button", { name: /Copy link/ })); });
    expect(writeText).toHaveBeenCalledWith("http://localhost:5000/ref/JOHN2880");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Referral link copied!" }));

    toast.mockClear();
    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(async () => { fireEvent.click(view.getByRole("button", { name: /Copy|Copied/ })); });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "We couldn't copy the link", variant: "destructive" }));
    view.unmount();
  });

  rule("REF-19", "When multiple rules exist, selecting a rule pill on the Refer & Earn card updates the offer and copies a rule-locked link (?rule=<id>) that locks the referee's bonus", {
    why: "When Mito Admin creates 3 referral rules, the Referrer chooses which rule to share so the Referee gets that exact bonus.",
    fix: "ReferEarnCard renders interactive currency/corridor pills that switch activeOffer and append ?rule=<rule_id> to the referral link; ReferralLanding and auth/rewardsService forward ruleId to Mito.",
    where: ["client/src/components/rewards/ReferEarnCard.tsx", "client/src/pages/ReferralLanding.tsx", "server/auth.ts", "server/rewardsService.ts"],
  }, async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const usdOffer: RewardOffer = { ...OFFER, rule_id: 2, currency: "USD", referee_reward: 20, referrer_reward: 10, floor: 100, text: "Invite friends with your link. You get $10.00 and your friend gets $20.00 in bonus credit when they send $100.00 or more within 30 days of joining." };
    const eurOffer: RewardOffer = { ...OFFER, rule_id: 3, currency: "EUR", referee_reward: 15, referrer_reward: 8, floor: 80, text: "Invite friends with your link. You get €8.00 and your friend gets €15.00 in bonus credit when they send €80.00 or more within 30 days of joining." };
    const view = card({ offer: OFFER, offers: [OFFER, usdOffer, eurOffer], sendCurrencies: ["GBP", "USD", "EUR"] });

    // Initially rule 1 (GBP) is active and link uses the currency-specific code JOHN2880GBP when multiple rules exist
    expect((view.getByLabelText("Your referral link") as HTMLInputElement).value).toBe("localhost:5000/ref/JOHN2880GBP");

    // Referrer clicks the USD → ALL pill in the header
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "USD → ALL" })); });
    expect(view.getByTestId("refer-offer-text").textContent).toBe(usdOffer.text);
    expect((view.getByLabelText("Your referral link") as HTMLInputElement).value).toBe("localhost:5000/ref/JOHN2880USD");

    await act(async () => { fireEvent.click(view.getByRole("button", { name: /Copy link/ })); });
    expect(writeText).toHaveBeenCalledWith("http://localhost:5000/ref/JOHN2880USD");
    view.unmount();

    // Verification forwards rule_id when referralRuleId was registered
    const email = `friendrule${Math.random().toString(36).slice(2, 8)}@example.com`;
    const reg = await authApi("/api/auth/register", { email, accountType: "individual", country: "GB", firstName: "Zara", lastName: "Ali", password: "Passw0rd!xx", confirmPassword: "Passw0rd!xx", referralCode: "john2880", referralRuleId: 2 });
    expect(reg.status).toBe(200);
    const verified = await authApi("/api/auth/verify-otp", { email, code: "123456" });
    expect(verified.status).toBe(200);
    const user = await ctx.storage.getAuthUserByEmail(email);
    await waitFor(() => expect(referralCalls(user!.id)).toHaveLength(1), { timeout: 3000 });
    expect(referralCalls(user!.id)[0].body).toEqual({ code: "JOHN2880", rule_id: 2, referee: { id: user!.id, send_currency: "GBP" } });
  });

  rule("REF-20", "Sharing a referral link provides a clear marketing message explaining why to register and make a transfer, renders the official Rhemito SVG logo, and reconciles referrer-earned history with My referrals", {
    why: "Sharing must convert referees with clear value propositions, open-graph cards must carry genuine Rhemito branding, and referrer rewards in the wallet must reflect in referrals summary.",
    fix: "lib/rewards.ts buildReferralShareMessage; ReferEarnCard.tsx refer-preview-marketing-btn, refer-share-dialog, refer-copy-marketing-btn; server/referralOpenGraph.ts /api/rewards/og-image/:code; server/rewardsRoutes.ts GET /api/rewards/summary wallet history reconciliation.",
    where: ["client/src/lib/rewards.ts", "client/src/components/rewards/ReferEarnCard.tsx", "server/referralOpenGraph.ts", "server/rewardsRoutes.ts"],
    timeout: 10_000,
  }, async () => {
    // a) buildReferralShareMessage verification
    const msg = buildReferralShareMessage({ offer: OFFER, code: "JOHN2880", link: "http://localhost:5000/ref/JOHN2880", includeUrl: true });
    expect(msg).toContain("JOHN2880");
    expect(msg).toContain("£10.00");
    expect(msg).toContain("£50.00");
    expect(msg).toContain("Why register & send with Rhemito:");
    expect(msg).toContain("How to claim your £10.00 bonus in 3 simple steps:");

    // b) ReferEarnCard dialog preview & copy
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const view = card();
    const previewBtn = view.getByTestId("refer-preview-marketing-btn");
    await act(async () => { fireEvent.click(previewBtn); });
    expect(view.getByTestId("refer-share-dialog")).toBeTruthy();
    expect(view.getByTestId("refer-marketing-message-preview").textContent).toContain("Why register & send with Rhemito:");
    await act(async () => { fireEvent.click(view.getByTestId("refer-copy-marketing-btn")); });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Why register & send with Rhemito:"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("http://localhost:5000/ref/JOHN2880"));
    view.unmount();

    // c) GET /api/rewards/og-image/JOHN2880
    const ogRes = await fetch(`${ctx.base}/api/rewards/og-image/JOHN2880`);
    expect(ogRes.status).toBe(200);
    const svg = await ogRes.text();
    expect(svg).toContain("M25.0764 30.3999");
    expect(svg).toContain("WHY REGISTER &amp; TRANSFER WITH RHEMITO");

    // d) Wallet history reconciliation in GET /api/rewards/summary
    ctx.stub.on(/^\/api\/wallet\//, {
      status: 200,
      body: {
        bonus_blocked: false,
        balances: [{ currency: "GBP", available: 15, earned: 15, used: 0, expired: 0 }],
        unused: [],
        credits: [],
        history: [{
          id: "sync_h1",
          type: "EARNED",
          notes: "Referrer reward – referred Sarah S.",
          credit_source: "REFERRAL",
          credit_source_detail: "REFERRER",
          amount: 15,
          currency: "GBP",
          created_at: "2026-10-20T10:00:00Z",
        }],
        promo_redemptions: [],
      },
    });
    ctx.stub.on(/^\/api\/referral\/referrals/, { status: 200, body: { data: [], summary: { joined: 0, earned_count: 0, total_earned: {} } } });
    const summaryRes = await ctx.api("GET", "/api/rewards/summary");
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.referrals.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ friend: "Sarah S.", status: "REWARDED", credited: 15 }),
    ]));
    expect(summaryRes.body.data.referrals.summary.joined).toBe(1);
  });

  rule("REF-23", "The Reward$ currency selector filters Overview, History, and My referrals consistently across currencies without cross-currency leakage, persists across tabs, and links from ReferEarnCard corridor pills", {
    why: "Multi-currency customers must see accurate balances, history, promo savings, and referral progress per selected currency across every tab on Reward$ without legacy null-currency promo rows or other currencies' referrals bleeding across views.",
    fix: "BonusAndDiscounts.tsx initializes pickedCurrency from ?currency=, aggregates valid ISO currencies into rewards-currency-select, filters referrals + computes per-currency referral-summary, defaults null promo/history currencies to homeCurrency, guards copyLink by currency, hides WaysToEarn on Overview (DEC-2026-11-17-HIDE-WAYS-TO-EARN), and preserves currency across tabs; ReferEarnCard.tsx appends &currency=<activeOffer.currency> to View all referrals when a non-primary corridor pill is selected.",
    where: ["client/src/pages/BonusAndDiscounts.tsx", "client/src/components/rewards/ReferEarnCard.tsx"],
    timeout: 15_000,
  }, async () => {
    if (!window.matchMedia) {
      window.matchMedia = (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });
    }
    if (typeof (globalThis as Record<string, unknown>).ResizeObserver === "undefined") {
      (globalThis as Record<string, unknown>).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {};
    }

    const gbpOffer: RewardOffer = {
      ...OFFER,
      rule_id: 1,
      currency: "GBP",
      referral_code: "JOHN2880GBP",
      referral_link: "http://localhost:5000/ref/JOHN2880GBP",
    };
    const usdOffer: RewardOffer = {
      ...OFFER,
      rule_id: 2,
      currency: "USD",
      referrer_reward: 10,
      referee_reward: 20,
      floor: 100,
      text: "Invite friends with your link. You get $10.00 and your friend gets $20.00 in bonus credit when they send $100.00 or more within 30 days of joining.",
      referral_code: "JOHN2880USD",
      referral_link: "http://localhost:5000/ref/JOHN2880USD",
    };

    // 1. ReferEarnCard "View all referrals" deep-links to ?tab=referrals&currency=USD when USD corridor pill is selected
    const cardView = card({ offer: gbpOffer, offers: [gbpOffer, usdOffer], sendCurrencies: ["GBP", "USD", "EUR"] });
    expect(cardView.getByRole("link", { name: /View all referrals/ }).getAttribute("href")).toBe("/bonus-discounts?tab=referrals");
    await act(async () => { fireEvent.click(cardView.getByRole("button", { name: "USD → ALL" })); });
    expect(cardView.getByRole("link", { name: /View all referrals/ }).getAttribute("href")).toBe("/bonus-discounts?tab=referrals&currency=USD");
    cardView.unmount();

    // 2. BonusAndDiscounts pre-selects USD from ?currency=USD and filters all 3 tabs across USD, GBP, and EUR
    const multiSummary = {
      customer: { id: "user_123", referralCode: "JOHN2880", currency: "GBP" },
      currency: "GBP",
      sendCurrencies: ["GBP", "USD", "EUR"],
      offer: gbpOffer,
      offers: [gbpOffer, usdOffer],
      wallet: {
        bonus_blocked: false,
        balances: [
          {
            currency: "GBP",
            available: 7,
            earned: 15,
            used: 8,
            expired: 0,
            used_transfer_count: 1,
            referral_credit_count: 1,
            other_credit_count: 0,
            by_source: [{ credit_source: "REFERRAL", label: "Referrals", earned: 15, used: 8, expired: 0, removed: 0, available: 7 }],
          },
          {
            currency: "USD",
            available: 10,
            earned: 10,
            used: 0,
            expired: 0,
            used_transfer_count: 0,
            referral_credit_count: 1,
            other_credit_count: 0,
            by_source: [{ credit_source: "REFERRAL", label: "Referrals", earned: 10, used: 0, expired: 0, removed: 0, available: 10 }],
          },
        ],
        unused: [
          { id: "u_gbp", source: "Referrer reward – referred Sarah S.", credit_source: "REFERRAL", credit_source_label: "Referral bonus – Sarah S.", reason_code: "REFERRAL_REWARD", amount: 15, remaining: 7, currency: "GBP", earned_on: "2026-10-01", expires_on: "2027-01-01", status: "PARTLY_USED" },
          { id: "u_usd", source: "Referrer reward – referred Alex M.", credit_source: "REFERRAL", credit_source_label: "Referral bonus – Alex M.", reason_code: "REFERRAL_REWARD", amount: 10, remaining: 10, currency: "USD", earned_on: "2026-10-05", expires_on: "2027-01-05", status: "UNUSED" },
        ],
        credits: [
          { id: "u_gbp", amount: 15, remaining: 7, currency: "GBP", status: "PARTLY_USED", expires_on: "2027-01-01", notes: "", reason_code: "REFERRAL_REWARD", created_at: "2026-10-01" },
          { id: "u_usd", amount: 10, remaining: 10, currency: "USD", status: "UNUSED", expires_on: "2027-01-05", notes: "", reason_code: "REFERRAL_REWARD", created_at: "2026-10-05" },
        ],
        history: [
          { id: "u_gbp", created_at: "2026-10-01T10:00:00Z", type: "EARNED", reason_code: "REFERRAL_REWARD", amount: 15, currency: "GBP", notes: "Referrer reward – referred Sarah S.", transfer_id: null, source_credit_id: null, credit_source: "REFERRAL", credit_source_label: "Referral bonus – Sarah S." },
          { id: "u_usd", created_at: "2026-10-05T10:00:00Z", type: "EARNED", reason_code: "REFERRAL_REWARD", amount: 10, currency: "USD", notes: "Referrer reward – referred Alex M.", transfer_id: null, source_credit_id: null, credit_source: "REFERRAL", credit_source_label: "Referral bonus – Alex M." },
        ],
        promo_redemptions: [
          { id: "p_legacy_null", code: "LEGACY5", amount: -5, currency: null, transfer_id: "TXN-LEG", created_at: "2026-10-02T10:00:00Z" },
          { id: "p_usd_4", code: "USDSAVE4", amount: -4, currency: "USD", transfer_id: "TXN-USD", created_at: "2026-10-06T10:00:00Z" },
        ],
      },
      referrals: {
        data: [
          { id: "R_GBP_1", friend: "Sarah S.", joined_on: "2026-09-20T10:00:00Z", status: "REWARDED", status_label: "Earned", currency: "GBP", floor: 50, qualification_deadline: "2027-01-01", reward: 5, credited: 5 },
          { id: "R_GBP_2", friend: "Musa I.", joined_on: "2026-09-25T10:00:00Z", status: "REGISTERED", status_label: "Joined", currency: "GBP", floor: 50, qualification_deadline: "2027-01-05", reward: 5, credited: 0 },
          { id: "R_USD_1", friend: "Alex M.", joined_on: "2026-10-04T10:00:00Z", status: "REWARDED", status_label: "Earned", currency: "USD", floor: 100, qualification_deadline: "2027-01-10", reward: 10, credited: 10 },
        ],
        summary: { joined: 3, earned_count: 2, total_earned: { GBP: 5, USD: 10 } },
      },
      latestOffer: null,
    };

    const prevFetch = globalThis.fetch;
    window.history.replaceState({}, "", "/bonus-discounts?tab=referrals&currency=USD");
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(["/api/rewards/summary"], multiSummary);
    qc.setQueryData(["/api/auth/me"], {
      user: { id: "user_123", email: "john@example.com", accountType: "individual", country: "GB", firstName: "John", lastName: "Doe", status: "active" },
    });

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const jsonResp = (payload: unknown) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("/api/rewards/summary")) return jsonResp({ data: multiSummary });
      if (url.includes("/api/promocodes/savings")) {
        return jsonResp({
          data: {
            items: [
              { id: "p_legacy_null", code: "LEGACY5", amount: 5, currency: null, transferId: "TXN-LEG", createdAt: "2026-10-02T10:00:00Z" },
              { id: "p_usd_4", code: "USDSAVE4", amount: 4, currency: "USD", transferId: "TXN-USD", createdAt: "2026-10-06T10:00:00Z" },
            ],
            saved: { GBP: 5, USD: 4 },
          },
        });
      }
      if (url.includes("/api/bonus/summary")) {
        return jsonResp({
          data: {
            currency: "GBP",
            currencies: ["GBP", "USD", "EUR"],
            blocked: false,
            offers: [{ id: 1, name: "Send 3, get £10", type: "LOYALTY", currency: "GBP", summary: "Complete 3 transfers and get £10.00." }],
            wallet: multiSummary.wallet,
          },
        });
      }
      if (url.includes("/api/auth/me")) {
        return jsonResp({
          user: { id: "user_123", email: "john@example.com", accountType: "individual", country: "GB", firstName: "John", lastName: "Doe", status: "active" },
        });
      }
      return jsonResp({ data: [] });
    }) as typeof fetch;

    const clickTab = async (view: ReturnType<typeof render>, name: string) => {
      const tabBtn = view.getByRole("tab", { name });
      await act(async () => {
        fireEvent.mouseDown(tabBtn, { button: 0, ctrlKey: false });
        fireEvent.click(tabBtn);
      });
    };

    const selectCurrency = async (view: ReturnType<typeof render>, code: string) => {
      const trigger = view.getByTestId("rewards-currency-select");
      await act(async () => {
        fireEvent.keyDown(trigger, { key: "ArrowDown" });
      });
      const option = await waitFor(() => view.getByRole("option", { name: code }));
      await act(async () => {
        fireEvent.click(option);
      });
    };

    const view = render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          NotificationContextProvider,
          null,
          React.createElement(
            ContactsProvider,
            null,
            React.createElement(TooltipProvider, null, React.createElement(BonusAndDiscounts)),
          ),
        ),
      ),
    );

    try {
      // (a) Initialized to My referrals + USD via ?tab=referrals&currency=USD
      await waitFor(() => expect(view.getByTestId("rewards-currency-select").textContent).toContain("USD"));
      expect(view.getByTestId("referral-summary").textContent).toContain("Joined: 1 · Earned: 1 · Total earned: $10.00");
      expect(view.getByTestId("referral-card-R_USD_1").textContent).toContain("Alex M.");
      expect(view.queryByTestId("referral-card-R_GBP_1")).toBeNull();
      expect(view.queryByTestId("referral-card-R_GBP_2")).toBeNull();

      // (b) Switch My referrals -> Overview -> History: USD persists, legacy null-currency promo does NOT leak into USD
      await clickTab(view, "Overview");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("USD");
      expect(view.getByTestId("bonus-totals").textContent).toContain("$10.00");
      await waitFor(() => expect(view.getByTestId("total-saved").textContent).toContain("$4.00"));
      expect(view.getByTestId("unused-bonus").textContent).toContain("Alex M.");
      expect(view.getByTestId("unused-bonus").textContent).not.toContain("Sarah S.");
      expect(view.queryByTestId("ways-to-earn")).toBeNull();

      await clickTab(view, "History");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("USD");
      await waitFor(() => expect(view.getByTestId("bonus-history").textContent).toContain("USDSAVE4"));
      expect(view.getByTestId("bonus-history").textContent).toContain("Alex M.");
      expect(view.getByTestId("bonus-history").textContent).not.toContain("Sarah S.");
      expect(view.getByTestId("bonus-history").textContent).not.toContain("LEGACY5");

      // (c) Switch currency to GBP: legacy null-currency promo attributes to homeCurrency (GBP), GBP referrals render, WaysToEarn stays hidden
      await selectCurrency(view, "GBP");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("GBP");
      expect(view.getByTestId("bonus-history").textContent).toContain("Sarah S.");
      expect(view.getByTestId("bonus-history").textContent).toContain("LEGACY5");
      expect(view.getByTestId("bonus-history").textContent).not.toContain("Alex M.");
      expect(view.getByTestId("bonus-history").textContent).not.toContain("USDSAVE4");

      await clickTab(view, "Overview");
      expect(view.getByTestId("bonus-totals").textContent).toContain("£7.00");
      expect(view.getByTestId("total-saved").textContent).toContain("£13.00");
      expect(view.queryByTestId("ways-to-earn")).toBeNull();

      await clickTab(view, "My referrals");
      expect(view.getByTestId("referral-summary").textContent).toContain("Joined: 2 · Earned: 1 · Total earned: £5.00");
      expect(view.getByTestId("referral-card-R_GBP_1").textContent).toContain("Sarah S.");
      expect(view.getByTestId("referral-card-R_GBP_2").textContent).toContain("Musa I.");
      expect(view.queryByTestId("referral-card-R_USD_1")).toBeNull();

      // (d) Switch currency to EUR (0 referrals, no EUR offer): empty state on My referrals, no fallback to GBP link, €0.00 on Overview, empty History
      toast.mockClear();
      await selectCurrency(view, "EUR");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("EUR");
      expect(view.queryByTestId("referral-summary")).toBeNull();
      expect(view.getByText("No referrals yet. Share your link to start earning.")).toBeTruthy();

      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: /Copy referral link/i }));
      });
      expect(toast).toHaveBeenCalledWith({
        title: "No referral offer right now",
        description: "There is no Refer & Earn offer for EUR at the moment.",
      });

      await clickTab(view, "Overview");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("EUR");
      expect(view.getByTestId("bonus-totals").textContent).toContain("€0.00");
      expect(view.getByTestId("total-saved").textContent).toContain("€0.00");

      await clickTab(view, "History");
      expect(view.getByTestId("rewards-currency-select").textContent).toContain("EUR");
      expect(view.queryByTestId("bonus-history")).toBeNull();
      expect(view.getByText("No rewards yet. Invite friends or use a promo code to start saving.")).toBeTruthy();
    } finally {
      view.unmount();
      qc.clear();
      globalThis.fetch = prevFetch;
      window.history.replaceState({}, "", "/");
    }
  });
});

describe("Who is signed in", () => {
  rule("REF-17", "The header initials and Dashboard welcome come from the signed-in user (first name, or business name, or email), never from a fixed name", {
    why: "A hard-coded name once showed another customer's name on every account. The greeting and avatar must always describe the person logged in (or the seeded demo account via GET /api/auth/demo-user when browsing unauthenticated in prototype demo mode).",
    fix: "lib/userDisplay.ts welcomeName(user) and userInitials(user); Dashboard.tsx and layout/Header.tsx derive activeUser = user ?? demoUser from useAuth() and render non-bold 'Welcome' with <span className=\"font-bold\">{welcomeName(activeUser)}</span> (PD-03) and userInitials(activeUser).",
    where: ["client/src/lib/userDisplay.ts", "client/src/hooks/use-auth.ts", "client/src/pages/Dashboard.tsx", "client/src/components/layout/Header.tsx", "server/auth.ts"],
  }, () => {
    expect(welcomeName({ accountType: "individual", firstName: "Mohammad", lastName: "Khan", email: "m@x.com" } as any)).toBe("Mohammad");
    expect(welcomeName({ accountType: "individual", firstName: "", email: "fatima.ali@x.com" } as any)).toBe("fatima.ali");
    expect(welcomeName({ accountType: "business", businessName: "Acme Ltd", firstName: "Sam", email: "s@x.com" } as any)).toBe("Acme Ltd");
    expect(welcomeName(null)).toBe("");
    expect(userInitials({ accountType: "individual", firstName: "Mohammad", lastName: "Khan", email: "m@x.com" } as any)).toBe("MK");
    expect(userInitials({ accountType: "business", businessName: "Acme Ltd", email: "s@x.com" } as any)).toBe("AL");

    const dash = source("client/src/pages/Dashboard.tsx");
    expect(dash).toMatch(/const \{ user \} = useAuth\(\)/);
    expect(dash).toMatch(/const activeUser = user \?\? demoUser/);
    expect(dash).toMatch(/data-testid="dashboard-welcome">Welcome\{welcomeName\(activeUser\) \? <> <span className="font-bold">\{welcomeName\(activeUser\)\}<\/span><\/> : ""\}/);
    const header = source("client/src/components/layout/Header.tsx");
    expect(header).toMatch(/const activeUser = user \?\? demoUser/);
    expect(header).toMatch(/\{userInitials\(activeUser\)\}/);
  });

  rule("REF-18", "NEGATIVE (fixed bug): no customer's name is hard-coded in the Dashboard welcome or the header", {
    why: "The welcome once read 'Welcome Olayinka' for everyone. Names, initials and the profile label must be derived from the logged-in user only.",
    fix: "Remove the literal and use welcomeName(user) / userInitials(user) / profileLabel(user) from lib/userDisplay.ts. (Demo names belong only in seed data and test fixtures.)",
    where: ["client/src/pages/Dashboard.tsx", "client/src/components/layout/Header.tsx", "client/src/lib/userDisplay.ts"],
  }, () => {
    const names = /\b(Olayinka|Mohammad|Akshita|Sarah|Kemi|Musa|John Doe)\b/;
    for (const f of ["client/src/pages/Dashboard.tsx", "client/src/components/layout/Header.tsx", "client/src/lib/userDisplay.ts"]) {
      expect(source(f), `${f} must not contain a hard-coded customer name`).not.toMatch(names);
    }
    expect(source("client/src/pages/Dashboard.tsx")).not.toMatch(/Welcome\s+[A-Z][a-z]+(?![a-zA-Z{])/);
  });

  rule("REF-24", "Referee welcome bonus on joining via link, 3-step strip copy, referral code hook, and dashboard single-line nowrap (DEC-2026-11-16-REFEREE-SIGNUP-BONUS)", {
    why: "Mohammad approved that referee welcome credit is added on joining via link, the 3-step strip displays Join · Send {floor}+ · {referrer} gets reward, the sign-up referral-code-hook explains both rewards, referralHelpText shows 'Waiting for their first successful transfer of...', and Dashboard welcome bonus earned pill remains on one line.",
    fix: "ReferralSignup.tsx (ReferralInviteStrip, ReferralCodeField), lib/rewards.ts (referralHelpText), and Dashboard.tsx (referral-bonus-earned-pill whitespace-nowrap).",
    where: ["client/src/components/rewards/ReferralSignup.tsx", "client/src/lib/rewards.ts", "client/src/pages/Dashboard.tsx"],
  }, () => {
    // 1. ReferralInviteStrip & ReferralCodeField static checks
    const signupSrc = source("client/src/components/rewards/ReferralSignup.tsx");
    expect(signupSrc).toContain("{name} invited you");
    expect(signupSrc).toContain("bonus credit on joining via link.");
    expect(signupSrc).toContain("welcome bonus credit");
    expect(signupSrc).toContain("added automatically when you sign up using the link");
    expect(signupSrc).toContain('You get {formatMoney(offer.referee_reward, offer.currency)} on sign-up');
    expect(signupSrc).toContain('gets ${formatMoney(offer.referrer_reward, offer.currency)} on your first successful transaction');

    // 2. referralHelpText unit assertion
    const now = new Date("2026-10-01T00:00:00Z");
    const fakeRef: MyReferral = {
      id: "R1",
      friend: "Alice M.",
      joined_on: "2026-09-20T10:00:00Z",
      status: "REGISTERED",
      status_label: "Joined",
      currency: "GBP",
      floor: 50,
      qualification_deadline: "2026-10-29",
      reward: 10,
      credited: 0,
    };
    expect(referralHelpText(fakeRef, now)).toBe("Waiting for their first successful transfer of £50.00 or more · 28 days left");

    // 3. Dashboard whitespace-nowrap check
    const dashSrc = source("client/src/pages/Dashboard.tsx");
    expect(dashSrc).toMatch(/data-testid="referral-bonus-earned-pill"[^>]*whitespace-nowrap/);
  });
});
