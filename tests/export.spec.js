const { test, expect } = require('./fixtures/arbiter.fixture');

test.describe('Export Modes', () => {
  test('dropdown opens and closes', async ({ arbiterPage: page }) => {
    await page.locator('#btn-export-toggle').click();
    await expect(page.locator('#export-dropdown')).not.toHaveClass(/hidden/);
    // Click outside to close
    await page.locator('#main-content').click();
    await expect(page.locator('#export-dropdown')).toHaveClass(/hidden/);
  });

  test('switch to Copy mode', async ({ arbiterPage: page }) => {
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="clipboard"]').click();
    await expect(page.locator('#export-mode-label')).toHaveText('Copy');
  });

  test('switch to Save mode', async ({ arbiterPage: page }) => {
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="file"]').click();
    await expect(page.locator('#export-mode-label')).toHaveText('Save');
  });

  test('switch to Accept mode', async ({ arbiterPage: page }) => {
    // First switch away, then back
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="clipboard"]').click();
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="accept"]').click();
    await expect(page.locator('#export-mode-label')).toHaveText('Accept');
  });

  test('agent status hidden in Copy mode', async ({ arbiterPage: page }) => {
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="clipboard"]').click();
    // Wait for the polling cycle to hide it
    await expect(page.locator('#agent-status')).toHaveClass(/hidden/, { timeout: 3000 });
  });

  test('agent status hidden in Save mode', async ({ arbiterPage: page }) => {
    await page.locator('#btn-export-toggle').click();
    await page.locator('.split-btn-option[data-mode="file"]').click();
    await expect(page.locator('#agent-status')).toHaveClass(/hidden/, { timeout: 3000 });
  });

  test('agent status visible in Accept mode', async ({ arbiterPage: page }) => {
    // Default is accept from CLI flag
    await expect(page.locator('#agent-status')).not.toHaveClass(/hidden/);
  });

  test('Accept sends POST to /api/prompts', async ({ arbiterPage: page }) => {
    // Add a comment first
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Export test');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    // Intercept the POST
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/prompts') && req.method() === 'POST'),
      page.locator('#btn-export').click(),
    ]);
    const body = request.postDataJSON();
    expect(body.markdown).toContain('Export test');
    expect(body.source).toBe('add-readme');
    expect(body.target).toBe('main');
  });

  test('toast appears after Accept', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Toast test');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await page.locator('#btn-export').click();
    // Should see the "Prompt accepted" toast
    await expect(page.locator('text=Prompt accepted')).toBeVisible({ timeout: 5000 });
  });
});
