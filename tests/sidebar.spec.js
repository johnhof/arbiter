const { test, expect } = require('./fixtures/arbiter.fixture');

test.describe('Sidebar', () => {
  test('toggle collapses sidebar', async ({ arbiterPage: page }) => {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  });

  test('toggle expands sidebar', async ({ arbiterPage: page }) => {
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  });

  test('file tree shows comment badges', async ({ arbiterPage: page }) => {
    // Add a file comment on first file
    const fileHeader = page.locator('.file-header').first();
    await fileHeader.locator('.btn-secondary').click({ force: true });
    const form = page.locator('.file-comments .comment-form').first();
    await form.locator('textarea').fill('Badge test');
    await form.locator('.btn-primary').click();
    // Check for badge in sidebar
    const badge = page.locator('.tree-file .badge-comment').first();
    await expect(badge).toBeVisible();
  });
});
