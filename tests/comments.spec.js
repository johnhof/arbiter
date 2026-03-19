const { test, expect } = require('./fixtures/arbiter.fixture');

test.describe('Diff-Level Comments', () => {
  test('create a diff-level comment', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    const form = page.locator('#diff-comment-area .comment-form');
    await expect(form).toBeVisible();
    await form.locator('textarea').fill('Test diff comment');
    await form.locator('.btn-primary').click();
    const block = page.locator('#diff-comment-area .comment-block');
    await expect(block).toBeVisible();
    await expect(block.locator('.comment-text')).toHaveText('Test diff comment');
  });

  test('edit a diff-level comment', async ({ arbiterPage: page }) => {
    // Create
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Original text');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    // Edit
    await page.locator('#diff-comment-area .comment-block .comment-actions .btn-secondary').click();
    const textarea = page.locator('#diff-comment-area .comment-block textarea');
    await textarea.fill('Edited text');
    await page.locator('#diff-comment-area .comment-block .btn-primary').click();
    await expect(page.locator('#diff-comment-area .comment-text')).toHaveText('Edited text');
  });

  test('delete a diff-level comment', async ({ arbiterPage: page }) => {
    // Create
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('To delete');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await expect(page.locator('#diff-comment-area .comment-block')).toHaveCount(1);
    // Delete
    await page.locator('#diff-comment-area .comment-block .comment-actions .btn-danger').click();
    await expect(page.locator('#diff-comment-area .comment-block')).toHaveCount(0);
  });
});

test.describe('File-Level Comments', () => {
  test('create a file-level comment', async ({ arbiterPage: page }) => {
    // Click the Comment button in the first file header
    const fileHeader = page.locator('.file-header').first();
    await fileHeader.locator('.btn-secondary').click({ force: true });
    const form = page.locator('.file-comments .comment-form').first();
    await expect(form).toBeVisible();
    await form.locator('textarea').fill('Test file comment');
    await form.locator('.btn-primary').click();
    const block = page.locator('.file-comments .comment-block').first();
    await expect(block).toBeVisible();
    await expect(block.locator('.comment-text')).toHaveText('Test file comment');
  });

  test('delete a file-level comment', async ({ arbiterPage: page }) => {
    const fileHeader = page.locator('.file-header').first();
    await fileHeader.locator('.btn-secondary').click({ force: true });
    const form = page.locator('.file-comments .comment-form').first();
    await form.locator('textarea').fill('To delete');
    await form.locator('.btn-primary').click();
    await expect(page.locator('.file-comments .comment-block').first()).toBeVisible();
    await page.locator('.file-comments .comment-block .comment-actions .btn-danger').first().click();
    await expect(page.locator('.file-comments .comment-block')).toHaveCount(0);
  });
});

test.describe('Inline Comments', () => {
  test('create an inline comment via click', async ({ arbiterPage: page }) => {
    // Find a line number and click it
    const lineNum = page.locator('.diff-line .line-num.new').filter({ hasText: /^\d+$/ }).first();
    await lineNum.dispatchEvent('mousedown');
    await lineNum.dispatchEvent('mouseup');
    // The inline form should appear
    const form = page.locator('.comment-form-row.temp .comment-form, .inline-comment-form');
    await expect(form).toBeVisible({ timeout: 5000 });
    await form.locator('textarea').fill('Inline test comment');
    await form.locator('.btn-primary').click();
    // A comment block should now exist
    const commentBlock = page.locator('.comment-block-row .comment-block');
    await expect(commentBlock.first()).toBeVisible();
  });

  test('cancel inline comment clears selection', async ({ arbiterPage: page }) => {
    const lineNum = page.locator('.diff-line .line-num.new').filter({ hasText: /^\d+$/ }).first();
    await lineNum.dispatchEvent('mousedown');
    await lineNum.dispatchEvent('mouseup');
    const form = page.locator('.comment-form-row.temp .comment-form, .inline-comment-form');
    await expect(form).toBeVisible({ timeout: 5000 });
    await form.locator('.btn-secondary').click();
    await expect(page.locator('.comment-form-row.temp')).toHaveCount(0);
    await expect(page.locator('.line-num.selected')).toHaveCount(0);
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('Shift+Enter saves comment', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    const textarea = page.locator('#diff-comment-area .comment-form textarea');
    await textarea.fill('Shift enter test');
    await textarea.press('Shift+Enter');
    await expect(page.locator('#diff-comment-area .comment-block .comment-text')).toHaveText('Shift enter test');
  });

  test('Esc Esc cancels comment form', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    const textarea = page.locator('#diff-comment-area .comment-form textarea');
    await textarea.press('Escape');
    await textarea.press('Escape');
    await expect(page.locator('#diff-comment-area .comment-form')).toHaveCount(0);
  });
});

test.describe('Comment Persistence', () => {
  test('comments survive page reload', async ({ arbiterPage: page }) => {
    await page.locator('#btn-diff-comment').click();
    await page.locator('#diff-comment-area .comment-form textarea').fill('Persist me');
    await page.locator('#diff-comment-area .comment-form .btn-primary').click();
    await expect(page.locator('#diff-comment-area .comment-block')).toHaveCount(1);
    // Reload
    await page.reload();
    await page.waitForSelector('.diff-file', { timeout: 15000 });
    await expect(page.locator('#diff-comment-area .comment-block')).toHaveCount(1);
    await expect(page.locator('#diff-comment-area .comment-text')).toHaveText('Persist me');
  });
});
