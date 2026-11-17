/**
 * Two-Phase Card 3DS & Gateway Confirmation Contracts
 * (`DEC-2026-11-17-CARD-3DS-AND-GATEWAY-CONFIRMATION`)
 *
 * Verifies:
 * 1. `POST /api/send-money/mito/resolve-card-redirect` never fetches Checkout.com interactive 3DS URLs
 *    and never defaults missing status to `"COMPSUCCESS"`.
 * 2. When Mito Retail gateway is configured, Step 4 `POST /api/send-money/transactions/:id/pay` for `card`
 *    and `instant_bank` keeps `status: "awaiting_payment"` (`paidAt: null`), skips duplicate
 *    `InitiateHostedTransaction` when `Transaction/SendMoney` succeeded, and defers `PAID`/`COMPLETED`
 *    reward/notification dispatch until gateway confirmation.
 * 3. `confirmSendMoneyGateway` (`POST /api/send-money/transactions/:id/confirm-gateway`) transitions
 *    `awaiting_payment` -> `completed` idempotently on `outcome: "completed"`, and releases held promo &
 *    bonus while keeping `tx` retryable on `outcome: "cancelled" | "failed" | "expired"`.
 * 4. Mito webhook (`POST /api/webhooks/mito`) with `payment_collected` / `transaction_completed`
 *    idempotently transitions an `awaiting_payment` gateway transaction to `completed`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bootContractApp, flush, resetContractApp, routeBrowserFetchTo, type ContractApp } from "./_mitoStub";
import { confirmSendMoneyGateway, paySendMoneyTransaction } from "@/lib/sendMoney";
import { __resetMitoRetailCacheForTests } from "../../../../server/mitoRetail";

let ctx: ContractApp;

function enableMitoRetailAgainstStub() {
  process.env.MITO_RETAIL_ALLOW_IN_VITEST = "1";
  process.env.MITO_RETAIL_BASE_URL = process.env.MITO_API_URL!;
  process.env.MITO_RETAIL_USERNAME = "stub_partner";
  process.env.MITO_RETAIL_PASSWORD = "stub_password";
  process.env.MITO_RETAIL_AFFILIATE_ID = "1001";
  process.env.MITO_RETAIL_SERVICE_NO = "2001";
  process.env.MITO_RETAIL_API_KEY = "stub_api_key";
  __resetMitoRetailCacheForTests();

  ctx.stub.on("/api/v1/mito/Auth/login", {
    status: 200,
    body: { data: { token: "stub_jwt_token", userId: "5887d933-28da-43e0-b171-33b949218e86" } },
  });
  ctx.stub.on(/^\/api\/v1\/mito\/Users/, {
    status: 200,
    body: { data: [{ id: "5887d933-28da-43e0-b171-33b949218e86", email: "john.doe@example.com" }] },
  });
  ctx.stub.on("/api/v1/Rate/validateRate", {
    status: 200,
    body: { data: { id: "rate_locked_22505752", rate: 2025.5, commission: 3 } },
  });
  ctx.stub.on(/^\/api\/v1\/mito\/Lookups\/types/, {
    status: 200,
    body: {
      data: {
        reason: [{ id: "1a082009-4970-4c65-ae91-0cda9c89006c", code: "FAMILYSUPPORT", name: "Family Support" }],
      },
    },
  });
  ctx.stub.on("/api/v1/Transaction/SendMoney", {
    status: 200,
    body: {
      data: {
        tnxref: "22505752",
        status: "Awaiting Payment",
        paymentReference: "ps_3MCqHSKBMe5RtJiAh8O_stub",
        paymentSession: {
          id: "ps_3MCqHSKBMe5RtJiAh8O_stub",
          payment_session_secret: "pss_stub",
          payment_session_token: "pst_stub",
        },
      },
    },
  });
}

function disableMitoRetailForTests() {
  delete process.env.MITO_RETAIL_ALLOW_IN_VITEST;
  delete process.env.MITO_RETAIL_BASE_URL;
  delete process.env.MITO_RETAIL_USERNAME;
  delete process.env.MITO_RETAIL_PASSWORD;
  delete process.env.MITO_RETAIL_AFFILIATE_ID;
  delete process.env.MITO_RETAIL_SERVICE_NO;
  delete process.env.MITO_RETAIL_API_KEY;
  __resetMitoRetailCacheForTests();
}

beforeAll(async () => {
  ctx = await bootContractApp();
});
afterAll(async () => {
  disableMitoRetailForTests();
  await ctx.close();
});
beforeEach(async () => {
  disableMitoRetailForTests();
  await resetContractApp(ctx);
});
afterEach(() => {
  disableMitoRetailForTests();
  vi.restoreAllMocks();
});

describe("Two-Phase Card 3DS & Gateway Confirmation (Option A)", () => {
  it("resolve-card-redirect never fetches checkout.com 3DS URLs and never defaults missing status to COMPSUCCESS", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const r1 = await ctx.api("POST", "/api/send-money/mito/resolve-card-redirect", {
      url: "https://api.sandbox.checkout.com/sessions-interceptor/sid_3ds_challenge",
      sessionId: "ps_3MCqHSKBMe5RtJiAh8O_stub",
    });
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBeNull();
    expect(r1.body.paymentStatus).toBeNull();
    // Only the test's own call to ctx.base happened; server never fetched api.sandbox.checkout.com
    const checkoutFetches = fetchSpy.mock.calls.filter(([u]) => String(u).includes("checkout.com"));
    expect(checkoutFetches).toHaveLength(0);

    const rDeclined = await ctx.api("POST", "/api/send-money/mito/resolve-card-redirect", {
      url: "https://api.sandbox.checkout.com/sessions-interceptor/sid_declined",
      redirectReason: "Card declined by issuer",
    });
    expect(rDeclined.status).toBe(200);
    expect(rDeclined.body.status).toBe("COMPFAILED");

    const rExplicit = await ctx.api("POST", "/api/send-money/mito/resolve-card-redirect", {
      url: "https://rhemito-ui.onrender.com/send-money?status=COMPSUCCESS&tnxref=22505752",
    });
    expect(rExplicit.status).toBe(200);
    expect(rExplicit.body.status).toBe("COMPSUCCESS");
    expect(rExplicit.body.tnxref).toBe("22505752");
  });

  it("keeps card gateway session awaiting_payment on /pay, skips duplicate InitiateHostedTransaction, and completes idempotently on confirm-gateway", async () => {
    enableMitoRetailAgainstStub();
    const restore = routeBrowserFetchTo(ctx.base);
    try {
      const tx = await ctx.newTx({
        beneficiaryId: "ben_uba_1",
        providerId: "prov_uba_1",
        affiliateRateId: "rate_init_1",
      });

      const paid = await paySendMoneyTransaction(
        tx.id,
        "card",
        { code: "SAVE5", discount: 1 },
        { mode: "pay_less", amount: 10 },
      );

      expect(paid.status).toBe("awaiting_payment");
      expect(paid.paidAt).toBeNull();
      expect(paid.mitoTransactionId).toBe("22505752");
      expect(paid.mitoPaymentSession).toMatchObject({ id: "ps_3MCqHSKBMe5RtJiAh8O_stub" });

      // Duplicate InitiateHostedTransaction must NOT be called when SendMoney succeeded
      expect(ctx.stub.to("/api/v1/mito/Transactions/InitiateHostedTransaction")).toHaveLength(0);

      // Promo & bonus were reserved at gateway open, but PAID/COMPLETED transfer events have NOT fired yet
      expect(ctx.stub.to("/api/promocodes/redeem")).toHaveLength(1);
      expect(ctx.stub.to("/api/wallet/user_123/apply")).toHaveLength(1);
      await flush();
      expect(ctx.stub.to("/api/bonus/transfer-events")).toHaveLength(0);
      expect(ctx.stub.to("/api/promocodes/transfer-events")).toHaveLength(0);
      expect(ctx.stub.to("/api/referral/transfer-events")).toHaveLength(0);

      // Now Checkout.com 3DS completes and onPaymentCompleted calls confirmSendMoneyGateway
      const confirmed = await confirmSendMoneyGateway(tx.id, {
        outcome: "completed",
        rawStatus: "COMPSUCCESS",
        paymentStatus: "Captured",
        paymentId: "pay_3ds_approved_001",
      });
      expect(confirmed.status).toBe("completed");
      expect(confirmed.paidAt).toEqual(expect.any(String));
      expect(confirmed.mitoPaymentReference).toBe("pay_3ds_approved_001");
      expect(confirmed.mitoPaymentSession).toBeUndefined();

      const statuses = (p: string) =>
        ctx.stub.to(p).filter((c) => c.body.transfer_id === tx.reference).map((c) => c.body.status);
      await vi.waitFor(
        () => {
          expect(statuses("/api/bonus/transfer-events")).toEqual(["PAID", "COMPLETED"]);
          expect(statuses("/api/promocodes/transfer-events")).toEqual(["PAID", "COMPLETED"]);
          expect(statuses("/api/referral/transfer-events")).toEqual(["PAID", "COMPLETED"]);
        },
        { timeout: 3000 },
      );

      // Second confirm-gateway call is idempotent (no duplicate PAID/COMPLETED events)
      const confirmedAgain = await confirmSendMoneyGateway(tx.id, {
        outcome: "completed",
        paymentId: "pay_3ds_approved_001",
      });
      expect(confirmedAgain.status).toBe("completed");
      await flush();
      expect(statuses("/api/bonus/transfer-events")).toEqual(["PAID", "COMPLETED"]);
      expect(statuses("/api/referral/transfer-events")).toEqual(["PAID", "COMPLETED"]);
    } finally {
      restore();
    }
  });

  it("releases held promo and bonus on cancelled/failed confirm-gateway and keeps the transaction retryable on Step 4", async () => {
    enableMitoRetailAgainstStub();
    const restore = routeBrowserFetchTo(ctx.base);
    try {
      const tx = await ctx.newTx({
        beneficiaryId: "ben_uba_1",
        providerId: "prov_uba_1",
        affiliateRateId: "rate_init_1",
      });

      const opened = await paySendMoneyTransaction(
        tx.id,
        "card",
        { code: "SAVE5", discount: 1 },
        { mode: "send_more", amount: 10 },
      );
      expect(opened.status).toBe("awaiting_payment");
      expect(Number(opened.receiveAmount)).toBeGreaterThan(202550);

      // User clicks "Change payment method" or card 3DS fails
      const rolledBack = await confirmSendMoneyGateway(tx.id, {
        outcome: "cancelled",
        reason: "Changed payment method",
      });
      expect(rolledBack.status).toBe("awaiting_payment");
      expect(rolledBack.paidAt).toBeNull();
      expect(rolledBack.paymentMethod).toBeNull();
      expect(rolledBack.fee).toBe("3.00");
      expect(rolledBack.promoCode).toBeNull();
      expect(rolledBack.bonusCredit).toBeNull();
      expect(rolledBack.receiveAmount).toBe("202550.00");

      expect(ctx.stub.to("/api/promocodes/release")[0].body).toEqual({
        transaction_id: tx.reference,
        reason: "PAYMENT_FAILED",
      });
      expect(ctx.stub.to("/api/wallet/user_123/release")[0].body).toEqual({
        transfer_id: tx.reference,
      });

      // Retrying /pay on the same transaction succeeds without 409 INVALID_STATE
      const retried = await paySendMoneyTransaction(
        tx.id,
        "card",
        { code: "SAVE5", discount: 1 },
        { mode: "pay_less", amount: 10 },
      );
      expect(retried.status).toBe("awaiting_payment");
      expect(ctx.stub.to("/api/promocodes/redeem")).toHaveLength(2);
      expect(ctx.stub.to("/api/wallet/user_123/apply")).toHaveLength(2);
    } finally {
      restore();
    }
  });

  it("transitions an awaiting_payment gateway transaction to completed when Mito webhook reports payment_collected", async () => {
    enableMitoRetailAgainstStub();
    const restore = routeBrowserFetchTo(ctx.base);
    try {
      const tx = await ctx.newTx({
        beneficiaryId: "ben_uba_1",
        providerId: "prov_uba_1",
        affiliateRateId: "rate_init_1",
      });

      await paySendMoneyTransaction(tx.id, "card");
      expect((await ctx.storage.getSendMoneyTransactionById(tx.id))!.status).toBe("awaiting_payment");

      const wh = await ctx.api("POST", "/api/webhooks/mito?skipVerify=true", {
        eventId: "evt_mito_22505752_collected",
        eventType: "payment_collected",
        data: {
          transactionRef: "22505752",
          partnerRef: tx.reference,
          status: "payment_collected",
        },
      });
      expect(wh.status).toBe(200);
      expect((await ctx.storage.getSendMoneyTransactionById(tx.id))!.status).toBe("completed");

      const statuses = (p: string) =>
        ctx.stub.to(p).filter((c) => c.body.transfer_id === tx.reference).map((c) => c.body.status);
      await vi.waitFor(
        () => {
          expect(statuses("/api/referral/transfer-events")).toEqual(["PAID", "COMPLETED"]);
        },
        { timeout: 3000 },
      );
    } finally {
      restore();
    }
  });

  it("sets CARDCHECKOUT RedirectSuccessUrl to Rhemito-UI /send/status and completes transaction by Mito tnxref on return", async () => {
    enableMitoRetailAgainstStub();
    const restore = routeBrowserFetchTo(ctx.base);
    try {
      const tx = await ctx.newTx({
        beneficiaryId: "ben_uba_1",
        providerId: "prov_uba_1",
        affiliateRateId: "rate_init_1",
      });

      const paid = await paySendMoneyTransaction(tx.id, "card");
      expect(paid.status).toBe("awaiting_payment");
      expect(paid.mitoTransactionId).toBe("22505752");

      const sendMoneyCalls = ctx.stub.to("/api/v1/Transaction/SendMoney");
      expect(sendMoneyCalls).toHaveLength(1);
      expect(sendMoneyCalls[0].body.RedirectSuccessUrl).toBe(`${ctx.base}/send/status`);
      expect(String(sendMoneyCalls[0].body.RedirectSuccessUrl)).not.toContain("rhemito-web-nextjs-dev");
      expect(String(sendMoneyCalls[0].body.RedirectSuccessUrl)).not.toContain("/send-money");

      const resolved = await ctx.api("POST", "/api/send-money/mito/resolve-card-redirect", {
        url: `${ctx.base}/send/status?tnxref=22505752&status=COMPSUCCESS&paymentStatus=Captured`,
      });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({
        tnxref: "22505752",
        transactionId: tx.id,
        reference: tx.reference,
        status: "COMPSUCCESS",
        paymentStatus: "Captured",
      });

      // Confirming via Mito tnxref (even if browser sessionStorage was cleared) completes the owned transaction
      const confirmedByTnxref = await confirmSendMoneyGateway("22505752", {
        outcome: "completed",
        rawStatus: "COMPSUCCESS",
        paymentStatus: "Captured",
        tnxref: "22505752",
      });
      expect(confirmedByTnxref.id).toBe(tx.id);
      expect(confirmedByTnxref.status).toBe("completed");
      expect(confirmedByTnxref.paidAt).toEqual(expect.any(String));
    } finally {
      restore();
    }
  });
});
