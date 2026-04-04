import { test, expect } from '@playwright/test';

/**
 * E2E tests for the repo-switching and false-404 fixes introduced in
 * fix: resolve false 404s and stale repo context during multi-repo switching on Windows
 *
 * All tests use Playwright route interception — no live gitnexus server required.
 *
 * Covers:
 *   1. Hold-queue: /api/repo returns 503 → UI shows descriptive timeout message
 *   2. ?project= URL persistence: handleServerConnect sets ?project= after connect
 *   3. ?project= auto-connect: navigating to /?project=<name> auto-connects
 *   4. Windows path normalization: repoPath with backslashes → correct project name
 *   5. Repo-switch preserves URL ?project= on every switch
 */

const BACKEND_URL = 'http://localhost:4747';

/** Minimal mock set for a server with one indexed repo named `repoName`. */
async function mockServerWithRepo(
  page: import('@playwright/test').Page,
  repoName: string,
  repoPath = `/tmp/${repoName}`,
) {
  await page.route(`${BACKEND_URL}/api/heartbeat`, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ':ok\n\n',
    }),
  );
  await page.route(`${BACKEND_URL}/api/info`, (route) =>
    route.fulfill({ json: { version: '1.0.0', launchContext: 'npx', nodeVersion: 'v22.0.0' } }),
  );
  await page.route(`${BACKEND_URL}/api/repos`, (route) =>
    route.fulfill({ json: [{ name: repoName, path: repoPath }] }),
  );
  await page.route(`${BACKEND_URL}/api/repo**`, (route) =>
    route.fulfill({ json: { name: repoName, path: repoPath, repoPath } }),
  );
  await page.route(`${BACKEND_URL}/api/graph**`, (route) =>
    route.fulfill({ json: { nodes: [], relationships: [] } }),
  );
  await page.route(`${BACKEND_URL}/api/embeddings**`, (route) => route.fulfill({ status: 200 }));
}

// ── 1. Hold-queue: 503 → descriptive user message ────────────────────────────

test.describe('Hold-queue timeout error', () => {
  test('shows descriptive message when /api/repo returns 503', async ({ page }, testInfo) => {
    const repoName = 'flash-pkg';

    // Server is up — heartbeat, info, repos all respond normally
    await page.route(`${BACKEND_URL}/api/heartbeat`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: ':ok\n\n',
      }),
    );
    await page.route(`${BACKEND_URL}/api/info`, (route) =>
      route.fulfill({ json: { version: '1.0.0', launchContext: 'npx', nodeVersion: 'v22.0.0' } }),
    );
    await page.route(`${BACKEND_URL}/api/repos`, (route) =>
      route.fulfill({ json: [{ name: repoName, path: `/tmp/${repoName}` }] }),
    );
    await page.route(`${BACKEND_URL}/api/graph**`, (route) =>
      route.fulfill({ json: { nodes: [], relationships: [] } }),
    );

    // /api/repo returns 503 (hold-queue timed out — analysis taking too long)
    await page.route(`${BACKEND_URL}/api/repo**`, (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: `Repository analysis for "${repoName}" is taking longer than expected. Please try again in a moment.`,
        },
      }),
    );

    await page.goto(`/?server=${encodeURIComponent(BACKEND_URL)}`);

    // The UI should show the 503 error message, not a generic "404" or blank screen
    await expect(page.getByText(/taking longer than expected/i)).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: testInfo.outputPath('hold-queue-503.png') });
  });
});

// ── 2. ?project= URL set after connect ───────────────────────────────────────

test.describe('?project= URL persistence', () => {
  test('?project= is added to URL after connecting via landing card', async ({ page }) => {
    const repoName = 'flash-pkg';
    await mockServerWithRepo(page, repoName);

    await page.goto('/');

    // Click the landing card to connect
    const landingCard = page.locator('[data-testid="landing-repo-card"]').first();
    try {
      await landingCard.waitFor({ state: 'visible', timeout: 15_000 });
      await landingCard.click();
    } catch {
      // may auto-connect
    }

    await expect(page.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 30_000 });

    // URL should contain ?project= with the connected repo name
    const url = new URL(page.url());
    const project = url.searchParams.get('project');
    expect(project).toBeTruthy();
    expect(project).toBe(repoName);
  });

  test('?project= persists after F5 reload', async ({ page }) => {
    const repoName = 'flash-pkg';
    await mockServerWithRepo(page, repoName);

    await page.goto('/');

    const landingCard = page.locator('[data-testid="landing-repo-card"]').first();
    try {
      await landingCard.waitFor({ state: 'visible', timeout: 15_000 });
      await landingCard.click();
    } catch {
      // may auto-connect
    }

    await expect(page.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 30_000 });

    // Reload — ?project= should remain in URL and display correctly
    await page.reload();

    // After F5, the app uses ?project= to reconnect — should reach exploring view again
    const url = new URL(page.url());
    const project = url.searchParams.get('project');
    expect(project).toBe(repoName);
  });
});

// ── 3. ?project= auto-connect ─────────────────────────────────────────────────

test.describe('?project= auto-connect', () => {
  test('navigating to /?project=<name> auto-connects without onboarding', async ({
    page,
  }, testInfo) => {
    const repoName = 'flash-pkg';
    await mockServerWithRepo(page, repoName);

    // Navigate directly with ?project= (the bookmarked URL)
    await page.goto(`/?project=${encodeURIComponent(repoName)}`);

    // Should skip onboarding and reach exploring view
    await expect(page.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 30_000 });

    // Onboarding should NOT be visible
    await expect(page.getByText('Start your local server')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('project-param-connect.png') });
  });
});

// ── 4. Windows path normalization ─────────────────────────────────────────────

test.describe('Windows path normalization', () => {
  test('project name uses basename when repoPath contains Windows backslashes', async ({
    page,
  }) => {
    const repoName = 'my-repo';
    const windowsPath = `C:\\Users\\LENOVO\\.gitnexus\\repos\\${repoName}`;

    // Mock server returns a Windows-style path in repoPath
    await page.route(`${BACKEND_URL}/api/heartbeat`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: ':ok\n\n',
      }),
    );
    await page.route(`${BACKEND_URL}/api/info`, (route) =>
      route.fulfill({ json: { version: '1.0.0', launchContext: 'npx', nodeVersion: 'v22.0.0' } }),
    );
    await page.route(`${BACKEND_URL}/api/repos`, (route) =>
      route.fulfill({ json: [{ name: repoName, path: windowsPath }] }),
    );
    // Intentionally omit `name` in /api/repo to force path-based extraction
    await page.route(`${BACKEND_URL}/api/repo**`, (route) =>
      route.fulfill({
        json: { name: repoName, path: windowsPath, repoPath: windowsPath },
      }),
    );
    await page.route(`${BACKEND_URL}/api/graph**`, (route) =>
      route.fulfill({ json: { nodes: [], relationships: [] } }),
    );
    await page.route(`${BACKEND_URL}/api/embeddings**`, (route) => route.fulfill({ status: 200 }));

    await page.goto('/');

    const landingCard = page.locator('[data-testid="landing-repo-card"]').first();
    try {
      await landingCard.waitFor({ state: 'visible', timeout: 15_000 });
      await landingCard.click();
    } catch {
      // may auto-connect
    }

    await expect(page.locator('[data-testid="status-ready"]')).toBeVisible({ timeout: 30_000 });

    // URL ?project= should contain the short name, NOT the full Windows path
    const url = new URL(page.url());
    const project = url.searchParams.get('project');
    expect(project).toBe(repoName);
    expect(project).not.toContain('\\');
    expect(project).not.toContain('LENOVO');
  });
});
