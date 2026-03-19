const { test, expect, REPO_PATH } = require('./fixtures/arbiter.fixture');

test.describe('App Load', () => {
  test('page title is Arbiter', async ({ arbiterPage: page }) => {
    await expect(page).toHaveTitle('Arbiter');
  });

  test('path input is pre-filled', async ({ arbiterPage: page }) => {
    const pathInput = page.locator('#base-path');
    await expect(pathInput).toHaveValue(REPO_PATH);
  });

  test('branch dropdowns are populated', async ({ arbiterPage: page }) => {
    const targetOptions = page.locator('#target-branch option');
    const sourceOptions = page.locator('#source-branch option');
    expect(await targetOptions.count()).toBeGreaterThan(1);
    expect(await sourceOptions.count()).toBeGreaterThan(1);
  });

  test('target defaults to main', async ({ arbiterPage: page }) => {
    await expect(page.locator('#target-branch')).toHaveValue('main');
  });

  test('source defaults to add-readme', async ({ arbiterPage: page }) => {
    await expect(page.locator('#source-branch')).toHaveValue('add-readme');
  });

  test('file count badge shows correct count', async ({ arbiterPage: page }) => {
    const badge = page.locator('#file-count');
    const count = parseInt(await badge.textContent());
    expect(count).toBeGreaterThan(0);
  });

  test('export mode defaults to Accept', async ({ arbiterPage: page }) => {
    await expect(page.locator('#export-mode-label')).toHaveText('Accept');
  });

  test('agent status indicator is visible in accept mode', async ({ arbiterPage: page }) => {
    const agentStatus = page.locator('#agent-status');
    await expect(agentStatus).not.toHaveClass(/hidden/);
  });
});
