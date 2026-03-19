const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_PATH = path.resolve(__dirname, '..');
const TEST_BRANCH = 'test-fixture-branch';
const ORIGINAL_BRANCH_FILE = path.join(__dirname, '.original-branch');

module.exports = async function globalSetup() {
  const git = (args) => execFileSync('git', args, { cwd: REPO_PATH, encoding: 'utf-8', stdio: 'pipe' });

  // Save the current branch so teardown can restore it
  const originalBranch = git(['symbolic-ref', '--short', 'HEAD']).trim();
  fs.writeFileSync(ORIGINAL_BRANCH_FILE, originalBranch);

  // Clean up any leftover test branch from a previous run
  try { git(['branch', '-D', TEST_BRANCH]); } catch {}

  // Create a test branch off main with a known change
  git(['checkout', '-b', TEST_BRANCH, 'main']);

  // Create a test file with known content
  const testFile = path.join(REPO_PATH, 'test-fixture.txt');
  fs.writeFileSync(testFile, 'line 1\nline 2\nline 3\nline 4\nline 5\n');
  git(['add', 'test-fixture.txt']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'test fixture: add test file']);

  // Modify the file for a second commit (so the diff has additions, deletions, context)
  fs.writeFileSync(testFile, 'line 1\nline 2 modified\nline 3\nnew line\nline 5\n');
  git(['add', 'test-fixture.txt']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '-m', 'test fixture: modify test file']);

  // Switch back to original branch
  git(['checkout', originalBranch]);
};
