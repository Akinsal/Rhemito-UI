import { test, expect } from '@playwright/test';

test.describe('Rhemito Dashboard', () => {

    test('Dashboard loads correctly', async ({ page }) => {
        // Navigate to Dashboard
        await page.goto('/');

        // Verify page title
        await expect(page).toHaveTitle(/Rhemito/i);

        // Verify Account Summary and Quick Services widgets are visible
        await expect(page.getByTestId('section-account-summary')).toBeVisible();
        await expect(page.getByText('Quick Services')).toBeVisible();

        // Verify Quick Service buttons are present
        await expect(page.getByTestId('button-send-money')).toBeVisible();
        await expect(page.getByTestId('button-request-payment')).toBeVisible();
        await expect(page.getByTestId('button-bonus-discounts')).toBeVisible();

        // Verify unified Transactions table with its type filter chips
        await expect(page.getByTestId('table-transactions')).toBeVisible();
        await expect(page.getByTestId('chip-type-all')).toBeVisible();
        await expect(page.getByTestId('chip-type-send-money')).toBeVisible();
        await expect(page.getByTestId('chip-type-receive-money')).toBeVisible();
        await expect(page.getByTestId('chip-type-invoice')).toBeVisible();
        await expect(page.getByTestId('chip-type-campaign')).toBeVisible();
    });

    test('Quick Services - Send Money navigation', async ({ page }) => {
        await page.goto('/');

        // Click Send Money button
        await page.getByTestId('button-send-money').click();

        // Verify navigation to Send Money page
        await expect(page).toHaveURL(/\/send-money/);
    });

    test('Quick Services - Receive Money opens the payment link flow directly', async ({ page }) => {
        await page.goto('/');

        // The button leads straight to the Receive Money link flow (no modal)
        await page.getByTestId('button-request-payment').click();
        await expect(page).toHaveURL(/\/request-payment/);
        await expect(page.getByRole('heading', { name: 'Receive Money' })).toBeVisible();
    });

    test('Quick Services - Send Invoice and Funding Campaigns have direct buttons', async ({ page }) => {
        await page.goto('/');

        // Smaller direct entries sit on the card beside the primary buttons
        const sendInvoice = page.getByTestId('button-send-invoice');
        const funding = page.getByTestId('button-funding-campaigns');
        await expect(sendInvoice).toBeVisible();
        await expect(funding).toBeVisible();

        // The modal no longer exists on the dashboard
        await expect(page.getByText('Ways to get paid')).toHaveCount(0);

        await sendInvoice.click();
        await expect(page).toHaveURL(/\/send-invoice/);
        await expect(page.getByRole('heading', { name: 'Send Invoice' })).toBeVisible();

        await page.goto('/');
        await funding.click();
        await expect(page).toHaveURL(/\/group-pay\/create/);
    });

    test('Unified Transactions table displays data', async ({ page }) => {
        await page.goto('/');

        // The server is shared with other specs, so rows can spill onto later
        // pages: locate seeded rows by searching for their reference.
        const search = page.getByTestId('input-search-transactions');
        await search.fill('22502784');
        await expect(page.getByTestId('row-transaction-22502784')).toBeVisible();

        // Verify Resend button is present on completed transaction
        await search.fill('22502785');
        await expect(page.getByTestId('button-resend-22502785')).toBeVisible();
    });

    test('Transaction type filters narrow the unified table', async ({ page }) => {
        await page.goto('/');

        // Rows are located by search so other specs' data cannot push them off page 1.
        const search = page.getByTestId('input-search-transactions');
        await search.fill('22502784');
        await expect(page.getByTestId('row-transaction-22502784')).toBeVisible();

        // Send Money chip keeps the send-money rows
        await page.getByTestId('chip-type-send-money').click();
        await expect(page.getByTestId('row-transaction-22502784')).toBeVisible();
        await search.fill('SCH001');
        await expect(page.getByTestId('row-scheduled-SCH001')).toBeVisible();

        // Invoices chip hides the send-money prototype rows
        await search.fill('22502784');
        await page.getByTestId('chip-type-invoice').click();
        await expect(page.getByTestId('row-transaction-22502784')).toBeHidden();
    });

    test('Transaction search narrows the unified table', async ({ page }) => {
        await page.goto('/');

        await page.getByTestId('input-search-transactions').fill('Aisha Bello');
        await expect(page.getByTestId('row-transaction-22502787')).toBeVisible();
        await expect(page.getByTestId('row-transaction-22502784')).toBeHidden();

        // Searching for another seeded row brings it back (independent of paging)
        await page.getByTestId('input-search-transactions').fill('22502784');
        await expect(page.getByTestId('row-transaction-22502784')).toBeVisible();
    });

    test('Unified table paginates at 20 records max per page across all types', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('chip-type-all')).toBeVisible();

        // Seeded demo data spans send money, receive money, invoices and campaigns (22+ rows)
        const rows = page.locator('[data-testid^="row-transaction-"], [data-testid^="row-scheduled-"], [data-testid^="row-receive_money-"], [data-testid^="row-invoice-"], [data-testid^="row-campaign-"]');
        await expect(rows).toHaveCount(20, { timeout: 10000 });
        await expect(page.getByTestId('transactions-pagination')).toContainText('Page 1 of');

        // Page 2 holds the remainder
        await page.getByTestId('button-next-page').click();
        await expect(rows.first()).toBeVisible();
        expect(await rows.count()).toBeGreaterThan(0);
        // Other specs add rows to the shared server, so only assert the page cap.
        expect(await rows.count()).toBeLessThanOrEqual(20);
        await expect(page.getByTestId('transactions-pagination')).toContainText('Page 2 of');

        // Back to page 1
        await page.getByTestId('button-prev-page').click();
        await expect(rows).toHaveCount(20);
    });

    test('Account Summary uses reference pastel scheme, bold heading, and clean Reward$ sidebar item', async ({ page }) => {
        await page.goto('/');

        const summarySection = page.getByTestId('section-account-summary');
        await expect(summarySection).toBeVisible();

        const heading = summarySection.getByRole('heading', { name: 'Account Summary' });
        await expect(heading).toHaveCSS('font-weight', '700');

        // Verify exact reference pastel backgrounds (#FFEDE7, #E5F1FE, #E0EED6)
        const totalSentCard = summarySection.locator('> div > div').first();
        await expect(totalSentCard).toHaveCSS('background-color', 'rgb(255, 237, 231)');
        await expect(page.getByTestId('card-wallet-balance')).toHaveCSS('background-color', 'rgb(229, 241, 254)');
        await expect(page.getByTestId('card-collection-account')).toHaveCSS('background-color', 'rgb(224, 238, 214)');

        // Verify 'NEW' tag and 'Rewards waiting!' subtext are removed from Sidebar Reward$
        await expect(page.getByTestId('rewards-waiting-badge')).toHaveCount(0);
        await expect(page.getByText('Rewards waiting!')).toHaveCount(0);
    });

    test('Wallet Balance and Collection Account cards open /overview/collectionaccount tabs cleanly', async ({ page }) => {
        await page.goto('/');

        // Interacting with GBP currency selector inside Wallet Balance card does NOT navigate away
        const walletCard = page.getByTestId('card-wallet-balance');
        await walletCard.getByRole('combobox').click();
        await expect(page).toHaveURL('/');
        await page.keyboard.press('Escape');

        // Clicking Wallet Balance card opens /overview/collectionaccount?tab=wallet on Wallets tab
        await walletCard.click();
        await expect(page).toHaveURL(/\/overview\/collectionaccount\?tab=wallet$/);
        await expect(page.getByTestId('heading-collection-account')).toHaveText('Collection Account');
        await expect(page.getByTestId('panel-wallets')).toBeVisible();
        await expect(page.getByTestId('wallet-details-heading')).toHaveText('Below Are The Details Of Your GBP Wallet');
        await expect(page.getByTestId('wallet-detail-balance')).toContainText('GBP 253,007.92');
        await expect(page.getByTestId('wallet-detail-amount-sent')).toContainText('GBP 750,895.75');
        await expect(page.getByTestId('wallet-detail-tx-count')).toHaveText('89');

        // Switching wallet currency updates right panel
        await page.getByTestId('wallet-currency-ngn').click();
        await expect(page.getByTestId('wallet-details-heading')).toHaveText('Below Are The Details Of Your NGN Wallet');
        await expect(page.getByTestId('wallet-detail-balance')).toHaveText('NGN 0.00');

        // Switching to Collection Accounts tab updates URL & shows bank details
        await page.getByTestId('tab-collection-accounts').click();
        await expect(page).toHaveURL(/\/overview\/collectionaccount$/);
        await expect(page.getByTestId('panel-collection-accounts')).toBeVisible();
        await expect(page.getByTestId('collection-details-heading')).toHaveText(
            'Below Are The Details Of Your British Pounds Payments Account'
        );
        await expect(page.getByText('The Currency Cloud Limited')).toBeVisible();

        // Switching collection currency to USD updates right panel
        await page.getByTestId('collection-currency-usd').click();
        await expect(page.getByTestId('collection-details-heading')).toHaveText(
            'Below Are The Details Of Your US Dollars Payments Account'
        );

        // Back button returns to Dashboard Overview
        await page.getByTestId('button-back-overview').click();
        await expect(page).toHaveURL('/');

        // Clicking Collection Account card on Dashboard opens /overview/collectionaccount directly
        await page.getByTestId('card-collection-account').click();
        await expect(page).toHaveURL(/\/overview\/collectionaccount$/);
        await expect(page.getByTestId('panel-collection-accounts')).toBeVisible();

        // View Transaction History navigates to /transactions
        await page.getByTestId('link-view-transaction-history').click();
        await expect(page).toHaveURL(/\/transactions/);
    });

});
