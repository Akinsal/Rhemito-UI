import { test, expect } from '@playwright/test';

test.describe('Settings / My Account (/settings)', () => {

    test('Header My Account opens /settings?tab=accounts with Settings active in sidebar and currency summary selectors', async ({ page }) => {
        await page.goto('/');

        // Open header profile dropdown and click My Account
        await page.getByTestId('button-profile-menu').click();
        await expect(page.getByTestId('header-menu-my-account')).toBeVisible();
        await page.getByTestId('header-menu-my-account').click();

        // Lands on /settings?tab=accounts
        await expect(page).toHaveURL(/\/settings\?tab=accounts$/);
        await expect(page.getByTestId('heading-settings')).toHaveText('Settings');
        await expect(page.getByTestId('panel-settings-accounts')).toBeVisible();

        // Sidebar Settings link is active
        await expect(page.getByTestId('link-settings')).toHaveClass(/text-\[#2e5bff\]/);

        // Verify Account summary figures and currency selectors
        await expect(page.getByRole('heading', { name: 'Account summary' })).toBeVisible();
        await expect(page.getByTestId('settings-account-number')).toHaveText('235324');
        await expect(page.getByTestId('settings-total-amount-sent')).toHaveText('750,895.75');
        await expect(page.getByTestId('settings-wallet-amount-sent')).toHaveText('750,895.75');
        await expect(page.getByTestId('settings-payment-account-amount')).toHaveText('4,357,384.08');

        // Switch Payment account currency to USD and verify figure updates
        await page.getByTestId('select-settings-payment-currency').click();
        await page.getByRole('option', { name: 'USD', exact: true }).click();
        await expect(page.getByTestId('settings-payment-account-amount')).toHaveText('2,641.84');
    });

    test('Sidebar Settings opens /settings (Edit profile) with timezone persistence and Request change modal', async ({ page }) => {
        await page.goto('/');

        await page.getByTestId('link-settings').click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page.getByTestId('panel-settings-profile')).toBeVisible();

        // Display timezone select & reset button
        const tzTrigger = page.getByTestId('select-display-timezone');
        await expect(tzTrigger).toBeVisible();
        await tzTrigger.click();
        await page.getByRole('option', { name: /WAT · UTC\+1 · Lagos/ }).click();
        await expect(tzTrigger).toContainText('WAT · UTC+1 · Lagos');

        await page.getByTestId('button-reset-timezone').click();
        await expect(tzTrigger).toContainText('GMT · UTC+0 · London');

        // Profile details rows derived from activeUser + Request change modal
        await expect(page.getByTestId('profile-value-full-name')).toHaveText('John Doe');
        await expect(page.getByTestId('profile-value-email')).toHaveText('demo@rhemito.com');
        await expect(page.getByTestId('profile-value-country')).toHaveText('UK');

        await page.getByTestId('button-request-change-address').click();
        await expect(page.getByRole('heading', { name: 'Request profile change' })).toBeVisible();

        // Cancel dismisses cleanly
        await page.getByTestId('button-cancel-profile-change').click();
        await expect(page.getByRole('heading', { name: 'Request profile change' })).toBeHidden();

        // Re-open, submit mandatory reason, and verify toast feedback
        await page.getByTestId('button-request-change-address').click();
        await page.getByTestId('textarea-profile-change-reason').fill('Moved to 10 Paddington Basin, London, W2 1AS');
        await page.getByTestId('button-submit-profile-change').click();
        await expect(page.getByRole('heading', { name: 'Request profile change' })).toBeHidden();
        await expect(page.getByText('Change request submitted').first()).toBeVisible();
    });

    test('Change password tab validates inputs, updates password via API, and restores demo password cleanly', async ({ page }) => {
        await page.goto('/settings?tab=password');
        await expect(page.getByTestId('panel-settings-password')).toBeVisible();

        const existingInput = page.getByTestId('input-existing-password');
        const newInput = page.getByTestId('input-new-password');
        const confirmInput = page.getByTestId('input-confirm-new-password');
        const submitBtn = page.getByTestId('button-submit-change-password');

        // 1. Validation: password < 8 characters
        await existingInput.fill('Demo1234!x');
        await newInput.fill('short');
        await confirmInput.fill('short');
        await submitBtn.click();
        await expect(page.getByText('Password too short').first()).toBeVisible();

        // 2. Visibility toggle works
        await expect(newInput).toHaveAttribute('type', 'password');
        await page.getByTestId('toggle-new-password').click();
        await expect(newInput).toHaveAttribute('type', 'text');
        await page.getByTestId('toggle-new-password').click();

        // 3. Valid password change -> clears fields & shows toast, then immediately restore Demo1234!x
        const tempPassword = 'TempSettingsPass99!x';
        try {
            await existingInput.fill('Demo1234!x');
            await newInput.fill(tempPassword);
            await confirmInput.fill(tempPassword);
            await submitBtn.click();

            await expect(page.getByText('Password updated').first()).toBeVisible();
            await expect(existingInput).toHaveValue('');
            await expect(newInput).toHaveValue('');
            await expect(confirmInput).toHaveValue('');
        } finally {
            // Restore Demo1234!x so other E2E specs relying on DEMO_PAYER_CREDENTIALS remain unaffected
            await page.request.post('/api/auth/change-password', {
                data: { existingPassword: tempPassword, newPassword: 'Demo1234!x' },
            });
        }
    });

    test('My cards tab renders dynamic cardholder name and removes a card via confirmation dialog', async ({ page }) => {
        await page.goto('/settings?tab=cards');
        await expect(page.getByTestId('panel-settings-cards')).toBeVisible();

        await expect(page.getByTestId('saved-card-4242')).toBeVisible();
        await expect(page.getByTestId('saved-card-4182')).toBeVisible();
        await expect(page.getByTestId('saved-card-1342')).toBeVisible();
        await expect(page.getByTestId('saved-card-holder-4242')).toHaveText('JOHN DOE');

        // Click trash icon -> Cancel keeps card
        await page.getByTestId('button-remove-card-1342').click();
        await expect(page.getByRole('heading', { name: 'Remove card?' })).toBeVisible();
        await page.getByTestId('button-cancel-remove-card').click();
        await expect(page.getByTestId('saved-card-1342')).toBeVisible();

        // Confirm removal -> removes card and shows toast
        await page.getByTestId('button-remove-card-1342').click();
        await page.getByTestId('button-confirm-remove-card').click();
        await expect(page.getByTestId('saved-card-1342')).toHaveCount(0);
        await expect(page.getByText('Card removed').first()).toBeVisible();
    });

    test('My bank accounts tab supports adding, setting primary, and removing a bank account cleanly', async ({ page }) => {
        await page.goto('/settings?tab=banks');
        const panel = page.getByTestId('panel-settings-banks');
        await expect(panel).toBeVisible();

        // Verify Sentence-case table headers
        for (const col of ['Bank', 'Holder', 'Account', 'Country', 'Currency']) {
            await expect(panel.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
        }

        // Open Add your bank account modal and add a USD test bank account
        await page.getByTestId('button-settings-add-bank').click();
        await expect(page.getByRole('heading', { name: 'Add your bank account' })).toBeVisible();

        await page.getByTestId('select-settings-bank-country').click();
        await page.getByRole('option', { name: /USA — USD/ }).click();
        await page.getByTestId('input-settings-bank-name').fill('Citibank Test');
        await page.getByTestId('input-settings-account-number').fill('9988774455');
        await page.getByTestId('input-settings-routing-number').fill('021000089');
        await page.getByTestId('button-confirm-add-bank').click();

        // Verify new row renders in table
        const addedRow = panel.locator('tbody tr', { hasText: 'CITIBANK TEST' });
        await expect(addedRow).toBeVisible();
        await expect(addedRow).toContainText('USA');
        await expect(addedRow).toContainText('USD');

        // Set newly added account as primary
        await addedRow.getByRole('button', { name: 'Set primary' }).click();
        await expect(addedRow.getByText('Primary', { exact: true })).toBeVisible();

        // Remove newly added account via confirmation dialog -> restores seeded account as Primary
        await addedRow.getByRole('button', { name: 'Remove' }).click();
        await expect(page.getByRole('heading', { name: 'Remove bank account?' })).toBeVisible();
        await page.getByTestId('button-confirm-remove-bank').click();
        await expect(addedRow).toHaveCount(0);
        await expect(page.getByTestId('badge-primary-bank-acc_demo_gbp')).toBeVisible();
    });

});
