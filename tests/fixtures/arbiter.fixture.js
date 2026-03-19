const { test: base, expect } = require('@playwright/test');
const path = require('path');

const REPO_PATH = path.resolve(__dirname, '../..');

exports.test = base.extend({
  arbiterPage: async ({ page }, use) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`/?path=${encodeURIComponent(REPO_PATH)}&source=add-readme&target=main&export=accept`);
    await page.waitForSelector('.diff-file', { timeout: 15000 });
    await use(page);
  },
});

exports.expect = expect;
exports.REPO_PATH = REPO_PATH;
