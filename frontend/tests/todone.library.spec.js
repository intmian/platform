import { test, expect } from '@playwright/test';

const libraryPath = '/todone/dir-12%2Fgrp-27%7C%E6%B5%8B%E8%AF%95lib%7C1';

test('todone/library 页面可访问', async ({ page }) => {
  await page.goto(libraryPath);
  await expect(page).toHaveURL(new RegExp(libraryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
