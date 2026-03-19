const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_PATH = path.resolve(__dirname, '..');
const TEST_BRANCH = 'test-fixture-branch';
const ORIGINAL_BRANCH_FILE = path.join(__dirname, '.original-branch');

module.exports = async function globalTeardown() {
  const git = (args) => execFileSync('git', args, { cwd: REPO_PATH, encoding: 'utf-8', stdio: 'pipe' });

  // Restore the original branch
  try {
    const originalBranch = fs.readFileSync(ORIGINAL_BRANCH_FILE, 'utf-8').trim();
    git(['checkout', originalBranch]);
    fs.unlinkSync(ORIGINAL_BRANCH_FILE);
  } catch {}

  // Delete the test branch
  try { git(['branch', '-D', TEST_BRANCH]); } catch {}

  // Remove the test file if it leaked (shouldn't, but safety)
  const testFile = path.join(REPO_PATH, 'test-fixture.txt');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
};
