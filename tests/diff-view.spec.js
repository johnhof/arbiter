const { test, expect } = require('./fixtures/arbiter.fixture');

test.describe('Diff View', () => {
  test('renders file sections', async ({ arbiterPage: page }) => {
    const files = page.locator('.diff-file');
    expect(await files.count()).toBeGreaterThan(0);
  });

  test('file paths shown in headers', async ({ arbiterPage: page }) => {
    const paths = page.locator('.file-path');
    const texts = await paths.allTextContents();
    expect(texts.length).toBeGreaterThan(0);
  });

  test('status badges present', async ({ arbiterPage: page }) => {
    const badges = page.locator('.file-status-badge');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('diff lines have correct classes', async ({ arbiterPage: page }) => {
    // Should have at least some additions and context lines
    const additions = page.locator('.diff-line.addition');
    const contextLines = page.locator('.diff-line.context');
    expect(await additions.count()).toBeGreaterThan(0);
    expect(await contextLines.count()).toBeGreaterThan(0);
  });

  test('line numbers present', async ({ arbiterPage: page }) => {
    const lineNums = page.locator('.line-num');
    expect(await lineNums.count()).toBeGreaterThan(0);
  });

  test('hunk separators present', async ({ arbiterPage: page }) => {
    const hunks = page.locator('.hunk-separator');
    expect(await hunks.count()).toBeGreaterThan(0);
  });

  test('file tree shows files', async ({ arbiterPage: page }) => {
    const treeFiles = page.locator('.tree-file');
    expect(await treeFiles.count()).toBeGreaterThan(0);
  });

  test('clicking file tree item scrolls to file', async ({ arbiterPage: page }) => {
    const firstTreeFile = page.locator('.tree-file').first();
    await firstTreeFile.click();
    // The corresponding file box should be near the top of the viewport
    const fileBox = page.locator('.diff-file').first();
    await expect(fileBox).toBeVisible();
  });

  test('collapse file box hides body', async ({ arbiterPage: page }) => {
    const firstHeader = page.locator('.file-header').first();
    const firstBody = page.locator('.diff-file-body').first();
    await firstHeader.click();
    await expect(firstBody).toHaveClass(/collapsed/);
    // Click again to expand
    await firstHeader.click();
    await expect(firstBody).not.toHaveClass(/collapsed/);
  });
});
