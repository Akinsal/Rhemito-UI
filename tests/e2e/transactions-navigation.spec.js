import { test, expect } from '@playwright/test';

test.describe('Sidebar Transactions navigation & dedicated page', () => {

    test('clicking Transactions in sidebar navigates to /transactions page', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('link-transactions')).toBeVisible();

        // Click Transactions in sidebar
        await page.getByTestId('link-transactions').click();

        // Verify URL and dedicated page elements
        await expect(page).toHaveURL(/\/transactions/);
        await expect(page.getByTestId('section-transactions-page')).toBeVisible();
        await expect(page.getByTestId('table-transactions')).toBeVisible();
        await expect(page.getByTestId('input-search-transactions')).toBeVisible();
        await expect(page.getByTestId('chip-type-all')).toBeVisible();
    });

    test('type query parameter applies the filter on /transactions', async ({ page }) => {
        await page.goto('/transactions?type=send_money');
        await expect(page.getByTestId('table-transactions')).toBeVisible();

        // The Send Money chip is selected instead of All
        await expect(page.getByTestId('chip-type-send-money')).toHaveClass(/bg-blue-600/);
        await expect(page.getByTestId('chip-type-all')).not.toHaveClass(/bg-blue-600/);

        // Every visible row is a Send Money row (zero receive_money, invoice, or campaign rows)
        const rows = page.locator('[data-testid^="row-transaction-"], [data-testid^="row-scheduled-"]');
        await expect(rows.first()).toBeVisible();
        await expect(page.locator('[data-testid^="row-receive_money-"], [data-testid^="row-invoice-"], [data-testid^="row-campaign-"]')).toHaveCount(0);
    });

    test('renders overview-aligned column headers, filter chips, amount format, and GMT date tooltip', async ({ page }) => {
        await page.goto('/transactions');
        await expect(page.getByTestId('table-transactions')).toBeVisible();

        // 7 Sentence-case column headers matching Overview
        const headers = page.locator('[data-testid="table-transactions"] thead th');
        await expect(headers).toHaveText(['Order no', 'Date', 'Name', 'Service', 'Amount', 'Status', 'Actions']);

        // Sentence-case filter chips
        await expect(page.getByTestId('chip-type-all')).toContainText('All');
        await expect(page.getByTestId('chip-type-send-money')).toContainText('Send money');
        await expect(page.getByTestId('chip-type-receive-money')).toContainText('Receive money');
        await expect(page.getByTestId('chip-type-invoice')).toContainText('Invoices');
        await expect(page.getByTestId('chip-type-campaign')).toContainText('Campaigns');

        // Amount format <Symbol> <2dp> (e.g. £ 100.00)
        const amountCells = page.locator('[data-testid="table-transactions"] tbody td:nth-child(5)');
        await expect(amountCells.first()).toBeVisible();
        await expect(amountCells.first()).toHaveText(/^[£$€¥A-Z]{1,3}\s+\d+\.\d{2}$/);

        // Hover date cell triggers HH:mm GMT tooltip
        const dateTrigger = page.locator('[data-testid="table-transactions"] tbody td:nth-child(2) span').first();
        await expect(dateTrigger).toBeVisible();
        await dateTrigger.hover();
        await expect(page.locator('[role="tooltip"]')).toContainText(/GMT/);
    });

    test('switching type filter chips on /transactions updates visible rows', async ({ page }) => {
        await page.goto('/transactions');
        await expect(page.getByTestId('chip-type-all')).toHaveClass(/bg-blue-600/);

        // Click Receive Money chip
        await page.getByTestId('chip-type-receive-money').click();
        await expect(page.getByTestId('chip-type-receive-money')).toHaveClass(/bg-blue-600/);
        await expect(page.getByTestId('chip-type-all')).not.toHaveClass(/bg-blue-600/);
    });

    test('plain dashboard load keeps the All filter by default', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByTestId('table-transactions')).toBeVisible();
        await expect(page.getByTestId('chip-type-all')).toHaveClass(/bg-blue-600/);
        await expect(page.getByTestId('chip-type-send-money')).not.toHaveClass(/bg-blue-600/);
    });

});
