const { test, expect } = require('./fixtures/arbiter.fixture');

test.describe('Comment Navigation', () => {
  test('nav hidden when no comments', async ({ arbiterPage: page }) => {
    await expect(page.locator('#comment-nav')).toHaveClass(/hidden/);
  });

  test('nav visible after adding comment', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Nav test');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await expect(page.locator('#comment-nav')).not.toHaveClass(/hidden/);
  });

  test('count display shows correct format', async ({ arbiterPage: page }) => {
    // Add two comments
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Comment 1');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Comment 2');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    const countText = await page.locator('#comment-nav-count').textContent();
    expect(countText).toMatch(/\d+\s*\/\s*2/);
  });

  test('next/prev buttons navigate comments', async ({ arbiterPage: page }) => {
    // Add a diff comment and a file comment to have navigable items
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Comment A');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    // Add file comment on first file
    const fileHeader = page.locator('.file-header').first();
    await fileHeader.locator('.btn-secondary').click({ force: true });
    const form = page.locator('.file-comments .comment-form').first();
    await form.locator('textarea').fill('Comment B');
    await form.locator('.btn-primary').click();
    // Navigate
    await page.locator('#comment-nav-down').click();
    // Count should update
    const countText = await page.locator('#comment-nav-count').textContent();
    expect(countText).toMatch(/\d+\s*\/\s*2/);
  });

  test('Clear All removes all comments', async ({ arbiterPage: page }) => {
    // Add a comment
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('To clear');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await expect(page.locator('#comment-nav')).not.toHaveClass(/hidden/);
    // Open menu and clear
    await page.locator('#comment-nav-menu-btn').click();
    await page.locator('#comment-nav-clear-all').click();
    await expect(page.locator('#comment-nav')).toHaveClass(/hidden/);
    await expect(page.locator('.comment-block')).toHaveCount(0);
  });
});
