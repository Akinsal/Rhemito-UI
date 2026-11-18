import { test, expect } from '@playwright/test';

test.describe('Signed-in name', () => {
    test('the dashboard welcome and header show the customer who is logged in with PD-03 bold name styling', async ({ page }) => {
        await page.route('**/api/auth/me', (route) => route.fulfill({
            json: { user: { id: 'u-mk', email: 'mohammad@example.com', accountType: 'individual', country: 'GB', firstName: 'Mohammad', lastName: 'Khan', status: 'active' } },
        }));
        await page.goto('/');
        const welcome = page.getByTestId('dashboard-welcome');
        await expect(welcome).toHaveText('Welcome Mohammad');
        await expect(welcome).toHaveCSS('font-weight', '400');
        const boldName = welcome.locator('span.font-bold');
        await expect(boldName).toHaveText('Mohammad');
        await expect(boldName).toHaveCSS('font-weight', '700');

        await expect(page.getByTestId('header-initials')).toHaveText('MK');
        await expect(page.getByTestId('header-profile-label')).toHaveText('Individual Profile');
        await expect(page.getByText('Olayinka', { exact: false })).toHaveCount(0);

        await page.getByTestId('button-profile-menu').click();
        await expect(page.getByTestId('header-dropdown-name')).toHaveText('Mohammad Khan');
    });
});
