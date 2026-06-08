async function findOrCreatePage(context) {
  const allPages = context.pages();
  let page = allPages.find(p => {
    try {
      return p.url().includes('cloud-playground/cloud-sandboxes') || p.url().includes('hands-on/playground/cloud-sandboxes');
    } catch {
      return false;
    }
  });

  if (!page) {
    console.error('INFO: No existing sandbox tab found — opening new extraction tab.');
    page = await context.newPage();
    page.__libAcgWasCreated = true;
  } else {
    console.error(`INFO: Found existing sandbox tab: ${page.url()}`);
  }

  return page;
}

async function navigateToSandbox(page, targetUrl) {
  const _sandboxReady = await page.locator(
    'button:has-text("Start Sandbox"), input[aria-label="Copyable input"]'
  ).first().isVisible({ timeout: 2000 }).catch(() => false);
  if (_sandboxReady) {
    console.error('INFO: Sandbox panel already loaded — skipping navigation');
    return;
  }

  const currentUrl = page.url();
  let currentHostname = '';
  try { currentHostname = new URL(currentUrl).hostname; } catch {}
  let targetPathname = '';
  try { targetPathname = new URL(targetUrl).pathname; } catch {}
  let currentPathname = '';
  try { currentPathname = new URL(currentUrl).pathname; } catch {}

  if (currentHostname !== 'app.pluralsight.com') {
    console.error(`INFO: Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else if (currentPathname === targetPathname) {
    console.error(`INFO: Already on ${currentUrl} — skipping navigation`);
  } else if (targetPathname.includes('cloud-sandboxes')) {
    console.error(`INFO: SPA-navigating to cloud-sandboxes from ${currentUrl}...`);
    // navLink.click() follows href to s2.pluralsight.com (404); also times out if
    // the Extend Your Session dialog reappears between dismiss and click.
    await page.evaluate(url => window.location.assign(url), targetUrl);
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
  } else {
    console.error(`INFO: Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
}

async function waitForSkeleton(page) {
  console.error('INFO: Waiting for page content to load...');
  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
    { timeout: 30000 }
  ).catch(() => console.error('WARN: Skeleton loaders did not clear within 30s — proceeding anyway'));
}

async function handleSignIn(page, targetUrl) {
  const signInLink = page.locator('a[href*="id.pluralsight.com"], a:has-text("Sign In"), button:has-text("Sign In")').first();
  const isSignInVisible = await signInLink.isVisible({ timeout: 10000 }).catch(() => false);
  if (!isSignInVisible) {
    return;
  }

  console.error('INFO: Not signed in — clicking Sign In...');
  await signInLink.click();
  await page.waitForURL('**id.pluralsight.com**', { timeout: 300000 });

  const emailInput = page.locator('input[type="email"], input[name="email"], input[id*="email"]').first();
  await emailInput.waitFor({ timeout: 30000 });
  await emailInput.click();
  const email = process.env.PLURALSIGHT_EMAIL || '';
  if (email) {
    await emailInput.fill(email);
    console.error('INFO: Filled email from PLURALSIGHT_EMAIL');
  } else {
    console.error('INFO: Clicked email field — waiting for Google Password Manager auto-fill (set PLURALSIGHT_EMAIL to assist)');
    await page.waitForTimeout(5000);
  }

  const continueBtn = page.locator('button[type="submit"], button:has-text("Continue")').first();
  if (await continueBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await continueBtn.click();
    await page.waitForTimeout(3000);
  }

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await passwordInput.click();
    await page.waitForTimeout(5000);
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
    if (await submitBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await submitBtn.click();
      console.error('INFO: Submitted sign-in form — waiting for redirect...');
    }
  }

  await page.waitForURL('**app.pluralsight.com**', { timeout: 300000 });
  console.error('INFO: Sign-in complete — resuming credential extraction...');

  await page.waitForFunction(
    () => !document.querySelector('[aria-busy="true"]'),
    { timeout: 30000 }
  ).catch(() => console.error('WARN: Skeleton loaders did not clear after login — proceeding anyway'));
}

async function _waitForSandboxEntry(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const hasStart = buttons.some(b => b.textContent.trim().includes('Start Sandbox'));
    const hasOpen = buttons.some(b => b.textContent.trim().includes('Open Sandbox'));
    const hasResume = buttons.some(b => b.textContent.trim().includes('Resume'));
    const inputs = document.querySelectorAll('input[aria-label="Copyable input"]');
    const hasCredentials = inputs.length > 0 && inputs[0].value.trim().length > 0;
    const hasExtendDialog = Array.from(document.querySelectorAll('[role="dialog"]'))
      .some(d => (d.innerText || '').includes('Extend Your Session'));
    return hasStart || hasOpen || hasResume || hasCredentials || hasExtendDialog;
  }, null, { timeout });
}

async function _waitForSandboxEntrySoft(page, timeout = 30000) {
  try {
    await _waitForSandboxEntry(page, timeout);
    return true;
  } catch {
    return false;
  }
}

async function _dismissExtendYourSessionDialog(page) {
  const dialogVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]'))
      .some(d => (d.innerText || '').includes('Extend Your Session'))
  ).catch(() => false);
  if (!dialogVisible) return;

  console.error('INFO: "Extend Your Session" dialog detected — clicking Extend button...');
  await page.bringToFront();
  const extendBtn = page.locator(
    '[data-testid="extend-sandbox-modal"] button:has-text("Extend"), [role="alertdialog"] button:has-text("Extend"), [role="dialog"] button:has-text("Extend")'
  ).first();
  const extendVisible = await extendBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (extendVisible) {
    await extendBtn.click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press('Enter').catch(() => {});
  }
  await page.waitForTimeout(1000);
  const dialogClosed = await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('[role="dialog"]'))
      .some(d => (d.innerText || '').includes('Extend Your Session')),
    { timeout: 5000 }
  ).then(() => true).catch(() => false);
  if (!dialogClosed) {
    console.error('WARN: "Extend Your Session" dialog still visible — credentials populate on either Cancel or Extend; continuing');
  }
}

async function _waitForCredentials(page, providerLabel) {
  console.error(`INFO: Waiting for ${providerLabel} credentials to populate (up to 420s)...`);
  const deadline = Date.now() + 420000;
  while (Date.now() < deadline) {
    await _dismissExtendYourSessionDialog(page);
    const inputs = page.locator('input[aria-label="Copyable input"]');
    if (await inputs.count() > 0) {
      const value = await inputs.first().inputValue().catch(() => '');
      if (value.trim().length > 0) return;
      // Panel open but credentials not yet populated — check for provider-scoped Start Sandbox.
      // Walk up from each Start Sandbox button (depth 6, no exclusion): depth 6 reaches the
      // panel container with providerLabel text but stays within the panel, before the shared
      // card-grid ancestor where both provider names appear (reached at depth 7-8).
      const allStart = page.locator('button:has-text("Start Sandbox")');
      const startCount = await allStart.count().catch(() => 0);
      let panelStartBtn = null;
      for (let i = 0; i < startCount; i++) {
        const btn = allStart.nth(i);
        const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
        if (!visible) continue;
        const inTargetPanel = await btn.evaluate((el, pLabel) => {
          const others = ['AWS', 'Google Cloud', 'GCP', 'Azure'].filter(
            p => !new RegExp(p, 'i').test(pLabel)
          );
          let node = el.parentElement;
          for (let j = 0; j < 20; j++) {
            if (!node) break;
            const t = node.innerText || '';
            if (new RegExp(pLabel, 'i').test(t) && !others.some(p => t.includes(p))) return true;
            if (new RegExp(pLabel, 'i').test(t) && others.some(p => t.includes(p))) break;
            node = node.parentElement;
          }
          return false;
        }, providerLabel).catch(() => false);
        if (inTargetPanel) { panelStartBtn = btn; break; }
      }
      if (panelStartBtn) {
        console.error(`INFO: ${providerLabel} panel open but sandbox not started — clicking Start Sandbox...`);
        await panelStartBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(5000);
        continue;
      }
    }
    const reopenBtn = await _findScopedButton(page, 'Open Sandbox', providerLabel, 0);
    if (reopenBtn) {
      console.error(`INFO: ${providerLabel} panel closed — re-opening to retrieve credentials...`);
      await reopenBtn.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(2000);
  }
  throw new Error(`Timed out after 420000ms waiting for ${providerLabel} credentials to populate.`);
}

async function _findScopedButton(page, buttonText, providerLabel, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const allBtns = page.locator(`button:has-text("${buttonText}")`);
    const count = await allBtns.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const btn = allBtns.nth(i);
      const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
      if (!visible) continue;
      const inCard = await btn.evaluate((el, label) => {
        const others = ['AWS', 'Google Cloud', 'GCP', 'Azure'].filter(
          p => !new RegExp(p, 'i').test(label)
        );
        let node = el.parentElement;
        for (let j = 0; j < 8; j++) {
          if (!node) break;
          const t = node.innerText || '';
          if (new RegExp(label, 'i').test(t) && !others.some(p => t.includes(p))) return true;
          node = node.parentElement;
        }
        return false;
      }, providerLabel).catch(() => false);
      if (inCard) return btn;
    }
    if (Date.now() < deadline) await page.waitForTimeout(500);
  }
  return null;
}

async function _deleteConflictingSandbox(page, targetProvider) {
  const _providerLabels = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure' };
  const targetLabel = _providerLabels[targetProvider] || targetProvider;

  const conflictingLabel = await page.evaluate((tLabel) => {
    const candidates = [
      { label: 'AWS', keywords: ['AWS'] },
      { label: 'Google Cloud', keywords: ['Google Cloud', 'GCP'] },
      { label: 'Azure', keywords: ['Azure'] },
    ].filter(c => !c.keywords.some(k => tLabel.toLowerCase().includes(k.toLowerCase())));

    for (const c of candidates) {
      const found = Array.from(document.querySelectorAll('*'))
        .some(el => {
          const t = el.innerText || '';
          return t.includes('Auto Shutdown') && c.keywords.some(k => t.includes(k));
        });
      if (found) return c.label;
    }
    return null;
  }, targetLabel).catch(() => null);

  if (!conflictingLabel) return;

  console.error(`INFO: Running ${conflictingLabel} sandbox detected — deleting before starting ${targetLabel}...`);

  let deleteBtn = await _findScopedButton(page, 'Delete Sandbox', conflictingLabel, 2000);
  if (!deleteBtn) {
    const openConflictBtn = await _findScopedButton(page, 'Open Sandbox', conflictingLabel, 5000);
    if (!openConflictBtn) {
      console.error(`WARN: Could not find Open Sandbox for conflicting ${conflictingLabel} sandbox — proceeding anyway`);
      return;
    }
    await openConflictBtn.click({ force: true });
    deleteBtn = await _findScopedButton(page, 'Delete Sandbox', conflictingLabel, 15000);
  }

  if (!deleteBtn) {
    console.error(`WARN: Delete Sandbox not found for ${conflictingLabel} — proceeding anyway`);
    return;
  }

  await deleteBtn.scrollIntoViewIfNeeded().catch(() => {});
  await deleteBtn.click({ force: true });

  await page.waitForTimeout(1500);
  const confirmBtn = page.locator('[role="alertdialog"] button', { hasText: /delete sandbox/i });
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click({ force: true });
  }

  console.error(`INFO: Waiting for ${conflictingLabel} sandbox deletion (up to 180s)...`);
  const deleted = await _findScopedButton(page, 'Start Sandbox', conflictingLabel, 180000);
  if (deleted) {
    console.error(`INFO: ${conflictingLabel} sandbox deleted.`);
  } else {
    console.error(`WARN: ${conflictingLabel} sandbox deletion may not be complete — proceeding anyway`);
  }
  // Close the deleted sandbox panel — after deletion it stays open in "Start Sandbox" state
  // and blocks the target provider's "Open Sandbox" from being actionable.
  const closeBtn = page.locator('button:has-text("Close")');
  if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.error(`INFO: Closing ${conflictingLabel} panel after deletion...`);
    await closeBtn.click({ force: true });
    await page.waitForTimeout(1000);
  }
}

async function startSandbox(page, targetUrl, provider) {
  provider = provider || 'aws';
  const _providerLabels = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure' };
  const providerLabel = _providerLabels[provider] || provider;

  console.error(`INFO: Looking for ${providerLabel} sandbox buttons...`);
  await page.addLocatorHandler(
    page.locator('text=/sandbox has been extended/i'),
    async () => { await page.waitForTimeout(500); }
  ).catch(() => {});
  await _dismissExtendYourSessionDialog(page);
  let sandboxEntryReady = await _waitForSandboxEntrySoft(page, 30000);
  const retryPathname = (() => {
    try { return new URL(targetUrl).pathname; } catch { return ''; }
  })();
  if (!sandboxEntryReady && retryPathname.includes('cloud-sandboxes') && !page.url().includes('cloud-sandboxes')) {
    console.error(`INFO: Sandbox route not active (${page.url()}) — navigating directly back to sandbox URL...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    sandboxEntryReady = await _waitForSandboxEntrySoft(page, 30000);
  }
  await _dismissExtendYourSessionDialog(page);
  if (!sandboxEntryReady) {
    console.error('WARN: Timed out waiting for sandbox buttons or credentials — proceeding anyway');
  }

  const credentialsAlreadyVisible = await page.evaluate((pLabel) => {
    const others = ['AWS', 'Google Cloud', 'GCP', 'Azure'].filter(
      p => !new RegExp(p, 'i').test(pLabel)
    );
    const inputs = Array.from(document.querySelectorAll('input[aria-label="Copyable input"]'));
    for (const input of inputs) {
      if (!input.value.trim()) continue;
      let node = input.parentElement;
      for (let j = 0; j < 12; j++) {
        if (!node) break;
        const t = node.innerText || '';
        if (new RegExp(pLabel, 'i').test(t) && !others.some(p => t.includes(p))) return true;
        node = node.parentElement;
      }
    }
    return false;
  }, providerLabel).catch(() => false);

  if (credentialsAlreadyVisible) {
    console.error(`INFO: ${providerLabel} credentials already populated — skipping Start/Open flow`);
    return;
  }

  await _deleteConflictingSandbox(page, provider);

  const startButton = await _findScopedButton(page, 'Start Sandbox', providerLabel, 5000);
  const openButton = await _findScopedButton(page, 'Open Sandbox', providerLabel, 5000);
  const resumeButton = await _findScopedButton(page, 'Resume', providerLabel, 5000);

  if (startButton) {
    const startEnabled = await startButton.isEnabled({ timeout: 1000 }).catch(() => false);
    if (startEnabled) {
      console.error('INFO: Clicking Start Sandbox...');
      await startButton.scrollIntoViewIfNeeded().catch(() => {});
      await startButton.click({ force: true });
    } else {
      console.error('INFO: Start Sandbox button is disabled — sandbox already running; waiting for credentials...');
    }
    await _waitForCredentials(page, providerLabel);
  } else if (openButton) {
    console.error('INFO: Clicking Open Sandbox...');
    await openButton.click({ force: true });
    await page.waitForTimeout(3000);

    const conflictWarning = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .some(el => (el.innerText || '').includes('You may have only one active sandbox at a time'))
    ).catch(() => false);
    if (conflictWarning) {
      console.error('WARN: Conflict warning still visible after Open Sandbox — retrying conflict deletion...');
      await _deleteConflictingSandbox(page, provider);
      const retryOpen = await _findScopedButton(page, 'Open Sandbox', providerLabel, 10000);
      if (retryOpen) {
        await retryOpen.click({ force: true });
        await page.waitForTimeout(3000);
      }
    }

    let startButton2 = await _findScopedButton(page, 'Start Sandbox', providerLabel, 30000);
    if (!startButton2) {
      console.error(`WARN: Scoped Start Sandbox not found for ${providerLabel} — trying provider-scoped fallback...`);
      const allStart = page.locator('button:has-text("Start Sandbox")');
      const count = await allStart.count().catch(() => 0);
      const _fbOthers = ['AWS', 'Google Cloud', 'GCP', 'Azure'].filter(p => !new RegExp(p, 'i').test(providerLabel));
      for (let i = 0; i < count; i++) {
        const btn = allStart.nth(i);
        const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
        const enabled = await btn.isEnabled({ timeout: 300 }).catch(() => false);
        if (!visible || !enabled) continue;
        const inTargetCard = await btn.evaluate((el, [pLabel, others]) => {
          let node = el.parentElement;
          for (let j = 0; j < 20; j++) {
            if (!node) break;
            const t = node.innerText || '';
            if (new RegExp(pLabel, 'i').test(t) && !others.some(p => t.includes(p))) return true;
            if (new RegExp(pLabel, 'i').test(t) && others.some(p => t.includes(p))) break;
            node = node.parentElement;
          }
          return false;
        }, [providerLabel, _fbOthers]).catch(() => false);
        if (inTargetCard) { startButton2 = btn; break; }
      }
    }
    if (startButton2) {
      const startEnabled2 = await startButton2.isEnabled({ timeout: 1000 }).catch(() => false);
      if (startEnabled2) {
        console.error('INFO: Clicking Start Sandbox (Step 2)...');
        await startButton2.scrollIntoViewIfNeeded().catch(() => {});
        await startButton2.click({ force: true });
      } else {
        console.error('INFO: Start Sandbox button is disabled — sandbox already running; waiting for credentials...');
      }
    } else {
      console.error(`WARN: No Start Sandbox button found for ${providerLabel} after Open Sandbox — proceeding to credential wait`);
    }
    await _waitForCredentials(page, providerLabel);
  } else if (resumeButton) {
    console.error('INFO: Clicking Resume Sandbox...');
    await resumeButton.scrollIntoViewIfNeeded().catch(() => {});
    await resumeButton.click({ force: true });
    await _waitForCredentials(page, providerLabel);
  }
}

module.exports = {
  findOrCreatePage,
  navigateToSandbox,
  waitForSkeleton,
  handleSignIn,
  startSandbox,
};
