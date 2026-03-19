const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:7430';
const REPO_PATH = '/home/ubuntu/athena/.shared/arbiter';

test.describe('API Endpoints', () => {
  test('validate-path with valid repo', async ({ request }) => {
    const res = await request.get(`${BASE}/api/validate-path?path=${encodeURIComponent(REPO_PATH)}`);
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  test('validate-path with invalid path', async ({ request }) => {
    const res = await request.get(`${BASE}/api/validate-path?path=/tmp/nonexistent-repo-xyz`);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  test('branches returns array with main and add-readme', async ({ request }) => {
    const res = await request.get(`${BASE}/api/branches?path=${encodeURIComponent(REPO_PATH)}`);
    const data = await res.json();
    expect(data.branches).toContain('main');
    expect(data.branches).toContain('add-readme');
  });

  test('diff returns files', async ({ request }) => {
    const res = await request.get(`${BASE}/api/diff?path=${encodeURIComponent(REPO_PATH)}&source=add-readme&target=main`);
    const data = await res.json();
    expect(data.files.length).toBeGreaterThan(0);
  });

  test('file-content returns lines', async ({ request }) => {
    const res = await request.get(`${BASE}/api/file-content?path=${encodeURIComponent(REPO_PATH)}&branch=main&file=server.js`);
    const data = await res.json();
    expect(data.lines.length).toBeGreaterThan(0);
  });

  test('initial-path returns CLI path', async ({ request }) => {
    const res = await request.get(`${BASE}/api/initial-path`);
    const data = await res.json();
    expect(data.path).toBe(REPO_PATH);
  });

  test('prompts POST/GET/PATCH cycle', async ({ request }) => {
    const params = `path=${encodeURIComponent(REPO_PATH)}&source=test-src&target=test-tgt`;
    // POST
    const postRes = await request.post(`${BASE}/api/prompts`, {
      data: { path: REPO_PATH, source: 'test-src', target: 'test-tgt', markdown: '# Test prompt' },
    });
    expect(postRes.ok()).toBe(true);
    // GET
    const getRes = await request.get(`${BASE}/api/prompts?${params}`);
    const getData = await getRes.json();
    expect(getData.markdown).toBe('# Test prompt');
    expect(getData.read).toBe(false);
    // PATCH
    const patchRes = await request.patch(`${BASE}/api/prompts?${params}`, {
      data: { read: true },
    });
    expect(patchRes.ok()).toBe(true);
    // Verify read
    const getRes2 = await request.get(`${BASE}/api/prompts?${params}`);
    const getData2 = await getRes2.json();
    expect(getData2.read).toBe(true);
  });

  test('readonly flag does not update lastAccess', async ({ request }) => {
    const params = `path=${encodeURIComponent(REPO_PATH)}&source=readonly-test&target=main`;
    // POST a prompt
    await request.post(`${BASE}/api/prompts`, {
      data: { path: REPO_PATH, source: 'readonly-test', target: 'main', markdown: '# RO test' },
    });
    // GET without readonly to set lastAccess
    await request.get(`${BASE}/api/prompts?${params}`);
    const statusRes1 = await request.get(`${BASE}/api/prompts/status?${params}`);
    const status1 = await statusRes1.json();
    const firstAccess = status1.lastAccess;
    expect(firstAccess).toBeGreaterThan(0);
    // Wait a moment, then GET with readonly
    await new Promise(r => setTimeout(r, 50));
    await request.get(`${BASE}/api/prompts?${params}&readonly=true`);
    const statusRes2 = await request.get(`${BASE}/api/prompts/status?${params}`);
    const status2 = await statusRes2.json();
    // lastAccess should NOT have changed
    expect(status2.lastAccess).toBe(firstAccess);
  });

  test('prompts/status returns lastAccess', async ({ request }) => {
    const params = `path=${encodeURIComponent(REPO_PATH)}&source=status-test&target=main`;
    await request.post(`${BASE}/api/prompts`, {
      data: { path: REPO_PATH, source: 'status-test', target: 'main', markdown: '# Status' },
    });
    await request.get(`${BASE}/api/prompts?${params}`);
    const res = await request.get(`${BASE}/api/prompts/status?${params}`);
    const data = await res.json();
    expect(data.lastAccess).toBeGreaterThan(0);
  });
});
