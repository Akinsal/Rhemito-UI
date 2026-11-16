import { test, expect } from '@playwright/test';

const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
});

async function mockBeneficiaries(page) {
    await page.route('**/api/send-money/mito/beneficiaries*', (route) =>
        route.fulfill(
            json({
                data: {
                    configured: true,
                    beneficiaries: [
                        {
                            beneficiaryId: '11111111-2222-3333-4444-555555555555',
                            name: 'Akshita',
                            firstName: 'Akshita',
                            lastName: 'Sharma',
                            legalEntityType: 'individual',
                            providerId: 'e3af932a-0326-4b65-b5f4-e8f753a69d4d',
                            bankName: 'United Bank for Africa Plc (UBA)',
                            acctNumber: '1018316888',
                            relationship: 'FRIEND',
                            reason: 'FOROWNEXPENDITURES',
                            narration: 'Family allowance',
                            address: '12 Marina Road',
                            city: 'Lagos',
                            postcode: '100001',
                            stateOrProvince: 'Lagos',
                            mobileNo: '08031234567',
                            currency: 'NGN',
                            country: 'Nigeria',
                            countryIso3: 'NGA',
                        },
                    ],
                },
            }),
        ),
    );
}

test.describe('Staging Payment Gateway & Recent Transactions Sorting E2E', () => {
    test('Step 4 502 PAYMENT_GATEWAY_ERROR guard stays on Step 4, shows error toast, and never fakes Payment Successful', async ({ page }) => {
        await mockBeneficiaries(page);

        await page.route('**/api/send-money/transactions/*/pay', (route) =>
            route.fulfill(
                json(
                    {
                        error: {
                            code: 'PAYMENT_GATEWAY_ERROR',
                            message: 'We could not open the payment gateway right now. Please try again or choose another payment method.',
                        },
                    },
                    502,
                ),
            ),
        );

        await page.goto('/send-money');
        await page.getByPlaceholder('0.00').first().fill('100');
        await page.getByRole('button', { name: 'Continue' }).click();

        await page.getByText('Akshita', { exact: true }).first().click();
        await expect(page.getByText('Recipient Details').first()).toBeVisible();
        await page.getByRole('button', { name: 'Continue' }).click();

        await expect(page.getByText('How would you like to pay?')).toBeVisible({ timeout: 15000 });
        await page.getByText('Instant Pay By Bank').click();

        const toast = page.locator('.destructive').filter({ hasText: 'Payment not completed' }).first();
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('We could not open the payment gateway right now.');

        await expect(page.getByText('Payment Successful')).toHaveCount(0);
        await expect(page.getByText('How would you like to pay?')).toBeVisible();
    });

    test('Recent Transactions All tab displays newly completed Send Money transfer at Row #1 above earlier same-day items', async ({ page }) => {
        const nowIso = new Date().toISOString();

        await page.route('**/api/send-money/transactions', async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill(
                    json({
                        data: [
                            {
                                id: 'tx-latest-today-1',
                                reference: 'TXN-LATEST-TODAY',
                                recipientName: 'Zainab Ahmed',
                                service: 'bank_deposit',
                                paymentMethod: 'card',
                                sendCurrency: 'GBP',
                                sendAmount: '150.00',
                                receiveCurrency: 'NGN',
                                receiveAmount: '274500.00',
                                fee: '2.00',
                                exchangeRate: '1830.00',
                                status: 'completed',
                                createdAt: nowIso,
                                paidAt: nowIso,
                            },
                        ],
                        meta: { total: 1 },
                    }),
                );
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await expect(page.getByTestId('table-transactions')).toBeVisible();
        await expect(page.getByTestId('chip-type-all')).toBeVisible();

        const rows = page.locator(
            '[data-testid^="row-transaction-"], [data-testid^="row-scheduled-"], [data-testid^="row-receive_money-"], [data-testid^="row-invoice-"], [data-testid^="row-campaign-"]',
        );
        await expect(rows.first()).toBeVisible({ timeout: 10000 });
        await expect(rows.first()).toHaveAttribute('data-testid', 'row-transaction-TXN-LATEST-TODAY');
    });
});
