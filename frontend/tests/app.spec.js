import { test, expect } from '@playwright/test';

test('首页可访问', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/127\.0\.0\.1:5173/);
});