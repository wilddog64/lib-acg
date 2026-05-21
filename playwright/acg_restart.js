const { chromium } = require('playwright');
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = '9222';
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;

/**
 * playwright/acg_restart.js
 *
 * Delete and restart an ACG sandbox to recover fresh AWS credentials.
 * Connects to an existing Chrome session via CDP.
 *
 * Flow:
 *   1. Connect to Chrome via CDP
 *   2. Detect page state: expanded panel (Delete Sandbox visible) or card view
 *   3. If card view: click Open Sandbox to reveal the panel
 *   4. Click Delete Sandbox → confirm deletion
 *   5. Click Start Sandbox
 *   6. Dismiss "Extend Your Session" dialog if it appears
 *   7. Exit — acg_credentials.js will extract credentials from the open panel
 *
 * Usage: node acg_restart.js <sandbox-url>
 */

const AUTH_DIR = path.join(os.homedir(), '.local', 'share', 'k3d-manager', 'profile');

async function _dismissExtendYourSessionDialog(page) {
  const visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]'))
      .some(d => (d.innerText || '').includes('Extend Your Session'))
  ).catch(() => false);
  if (!visible) return;
  console.error('INFO: "Extend Your Session" dialog detected — clicking Cancel via DOM...');
  await page.evaluate(() => {
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
      .find(d => (d.innerText || '').includes('Extend Your Session'));
    if (!dialog) return;
    const btns = Array.from(dialog.querySelectorAll('button'));
    const dismiss = btns.find(b => /cancel|no thanks|close|dismiss/i.test(b.textContent || b.getAttribute('aria-label') || ''))
      || btns.find(b => !/extend/i.test(b.textContent || ''));
    if (dismiss) dismiss.click();
  }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function _isExtendYourSessionVisible(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]'))
      .some(d =>
        (d.innerText || '').includes('Extend Your Session') &&
        d.offsetParent !== null &&
        getComputedStyle(d).display !== 'none'
      )
  ).catch(() => false);
}

async function restartSandbox() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error('ERROR: No sandbox URL provided');
    process.exit(1);
  }

  let _cdpBrowser = null;
  let browserContext = null;

  try {
    // Connect via CDP. Chrome may have no open tabs — if so, open a blank tab via
    // the HTTP API to surface the profile context (same pattern as acg_credentials.js).
    // Only fall back to launchPersistentContext if CDP is completely unavailable
    // (Chrome crashed). Do NOT delete profile lock files while Chrome is running.
    let _cdpFailed = false;
    try {
      _cdpBrowser = await chromium.connectOverCDP(CDP_URL);
      let _contexts = _cdpBrowser.contexts();
      if (_contexts.length === 0) {
        console.error('INFO: CDP connected but no open tabs — opening blank tab to expose profile context.');
        await new Promise((resolve, reject) => {
          const req = http.request(
            { hostname: CDP_HOST, port: CDP_PORT, path: '/json/new', method: 'PUT' },
            res => { res.resume(); resolve(); }
          );
          req.on('error', reject);
          req.end();
        });
        await new Promise(r => setTimeout(r, 500));
        try { await _cdpBrowser.disconnect(); } catch {}
        _cdpBrowser = await chromium.connectOverCDP(CDP_URL);
        _contexts = _cdpBrowser.contexts();
      }
      if (_contexts.length > 0) {
        browserContext = _contexts[0];
        console.error('INFO: Connected via CDP to existing browser session.');
      } else {
        try { await _cdpBrowser.disconnect(); } catch {}
        _cdpBrowser = null;
      }
    } catch {
      _cdpBrowser = null;
      _cdpFailed = true;
    }
    if (!browserContext) {
      if (!_cdpFailed) {
        throw new Error('CDP Chrome is running but has no accessible browser context after blank tab');
      }
      // CDP truly unavailable — Chrome crashed. Clean stale profile locks and relaunch.
      for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
        try { fs.unlinkSync(path.join(AUTH_DIR, lockFile)); console.error(`INFO: Removed stale Chrome lock: ${lockFile}`); } catch { /* not present */ }
      }
      console.error(`INFO: CDP unavailable — launching persistent context from ${AUTH_DIR}...`);
      browserContext = await chromium.launchPersistentContext(AUTH_DIR, {
        headless: false,
        channel: 'chrome',
        args: ['--password-store=basic'],
      });
    }

    const allPages = browserContext.pages();
    const _tabUrls = allPages.map(p => { try { return p.url(); } catch { return 'unknown'; } });
    console.error(`INFO: Open tabs (${allPages.length}): ${JSON.stringify(_tabUrls)}`);

    // Prefer sandbox tab; fall back to any Pluralsight tab; then first tab
    let page = allPages.find(p => {
      try { const u = p.url(); return u.includes('cloud-sandboxes') || u.includes('hands-on/playground') || u.includes('cloud-playground'); } catch { return false; }
    }) || allPages.find(p => {
      try { return new URL(p.url()).hostname.endsWith('.pluralsight.com'); } catch { return false; }
    }) || allPages[0];
    if (!page) throw new Error('No page found in browser context');

    // Navigate to sandbox listing if not already there
    const currentUrl = page.url();
    const isOnSandboxPage = currentUrl.includes('cloud-sandboxes') || currentUrl.includes('hands-on/playground') || currentUrl.includes('cloud-playground');
    if (!isOnSandboxPage) {
      let normalizedUrl = targetUrl;
      if (normalizedUrl.includes('cloud-playground/cloud-sandboxes')) {
        normalizedUrl = normalizedUrl.replace('cloud-playground/cloud-sandboxes', 'hands-on/playground/cloud-sandboxes');
      }
      console.error(`INFO: Navigating to ${normalizedUrl}...`);
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const postNavUrl = page.url();
      if (postNavUrl.includes('/id') || postNavUrl.includes('sign-in') || postNavUrl.includes('login')) {
        throw new Error(`Pluralsight session expired — redirected to ${postNavUrl}. Re-login in Chrome and retry.`);
      }
    } else {
      console.error(`INFO: Already on sandbox page: ${currentUrl}`);
    }

    // Wait for sandbox card buttons to render
    await page.waitForSelector(
      'button:has-text("Open Sandbox"), button:has-text("Delete Sandbox"), button:has-text("Start Sandbox")',
      { timeout: 30000 }
    ).catch(async () => {
      const url = page.url();
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .map(b => (b.innerText || b.textContent || '').trim())
          .filter(t => t.length > 0)
      ).catch(() => []);
      console.error(`WARN: Sandbox card buttons did not appear within 30s. URL: ${url} | Buttons: ${JSON.stringify(btns)}`);
    });

    // If Delete Sandbox is not immediately visible, click Open Sandbox to reveal the panel
    const deleteBtn = page.locator('button:has-text("Delete Sandbox")').first();
    if (!await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.error('INFO: Delete Sandbox not visible — clicking Open Sandbox to reveal panel...');
      const openBtn = page.locator('button:has-text("Open Sandbox")').first();
      if (!await openBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        const url = page.url();
        const btns = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .map(b => (b.innerText || b.textContent || '').trim())
            .filter(t => t.length > 0)
        ).catch(() => []);
        throw new Error(`Neither Delete Sandbox nor Open Sandbox visible. URL: ${url} | Buttons: ${JSON.stringify(btns)}`);
      }
      await openBtn.click({ force: true });
      await page.waitForSelector('button:has-text("Delete Sandbox")', { timeout: 15000 });
    }

    // Click Delete Sandbox — up to 3 attempts to get past "Extend Your Session" interception.
    // The Extend dialog intercepts the first click; dismiss it and always re-click.
    // Stop early when the "Delete AWS Sandbox?" confirmation dialog appears.
    console.error('INFO: Clicking Delete Sandbox...');
    await deleteBtn.click({ force: true });

    const _confirmDialogVisible = async () =>
      page.locator('[role="dialog"]:has-text("Delete AWS Sandbox")').first()
        .isVisible({ timeout: 500 }).catch(() => false);

    for (let _i = 0; _i < 3; _i++) {
      await page.waitForTimeout(1500);
      if (await _confirmDialogVisible()) break;
      if (await _isExtendYourSessionVisible(page)) {
        console.error(`INFO: "Extend Your Session" intercepted Delete click (attempt ${_i + 1}) — dismissing and re-clicking...`);
        await _dismissExtendYourSessionDialog(page);
        await page.waitForTimeout(500);
        if (!await _confirmDialogVisible() && await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await deleteBtn.click({ force: true });
        }
      }
    }

    // Confirm deletion — the <dialog> container intercepts pointer events at the button
    // coordinates (pando design-system CSS), so use a DOM-level click via evaluate()
    // rather than Playwright's simulated pointer event.
    const confirmDialog = page.locator('[role="alertdialog"]:has-text("Delete AWS Sandbox"), [role="dialog"]:has-text("Delete AWS Sandbox")').first();
    if (!await confirmDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      throw new Error('Delete confirmation dialog ("Delete AWS Sandbox?") did not appear');
    }
    console.error('INFO: Confirming deletion...');
    await page.locator('[data-testid="delete-sandbox-button"]').evaluate(el => el.click());

    // Wait for Start Sandbox button — deletion takes up to 2 minutes on the backend
    console.error('INFO: Waiting for Start Sandbox button (up to 120s)...');
    const startBtn = page.locator('button:has-text("Start Sandbox")').first();
    if (!await startBtn.isVisible({ timeout: 120000 }).catch(() => false)) {
      throw new Error('Start Sandbox button did not appear after deletion');
    }
    console.error('INFO: Clicking Start Sandbox...');
    await startBtn.click({ force: true });

    // Dismiss "Extend Your Session" dialog if it appears after starting
    await page.waitForTimeout(3000);
    await _dismissExtendYourSessionDialog(page);

    console.error('INFO: Sandbox restarted. Ready for credential extraction.');
    console.log('RESTART_OK');
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    if (_cdpBrowser) {
      await _cdpBrowser.disconnect().catch(() => {});
    } else if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }
}

const TIMEOUT_MS = 120000;
Promise.race([
  restartSandbox(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Script timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
  )
]).catch(err => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
