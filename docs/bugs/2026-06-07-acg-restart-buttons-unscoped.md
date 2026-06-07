# Bugfix: v0.1.4 — acg_restart.js has unscoped button lookups and missing exclusion check

**Branch:** `feat/v0.1.4`
**Files:** `playwright/acg_restart.js`, `CHANGELOG.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md`

---

## Problem

`acg_restart.js` has its own copy of `_findScopedButton` (lines 96–119). The exclusion check
added to `sandbox.js`'s copy in `654f319` was never applied to `acg_restart.js`. Without
the exclusion check, a shared ancestor whose `innerText` includes ALL provider labels can
match the wrong provider's button.

Additionally, three button lookups inside `restartSandbox` are unscoped locators:

1. **`deleteBtn`** (line 283): `page.locator('button:has-text("Delete Sandbox")').first()` —
   if both AWS and Azure sandboxes have a "Delete Sandbox" button visible, this picks the
   first in DOM order, which may be the wrong provider.

2. **`openBtn`** (line 286): `page.locator('button:has-text("Open Sandbox")').first()` —
   opens the first provider's panel regardless of which provider is the target.

3. **`_startBtnPanel`** (line 302): `page.locator('button:has-text("Start Sandbox")').first()` —
   in the `_sandboxNotYetStarted` path, clicks the first visible Start Sandbox button, which
   may belong to a different provider.

Combined with the `sandbox.js` fallback bug, these cause the sandbox cycling observed in
live tests: `acg_restart.js` opens/deletes/starts the wrong provider's sandbox, which then
appears running on the next `acg_credentials.js` run, triggering another deletion cycle.

**Root causes:**
- `_findScopedButton` in `acg_restart.js` lacks the `others` exclusion check (present in `sandbox.js` since `654f319`)
- `openBtn`, `deleteBtn`, `_startBtnPanel` are plain unscoped locators, not provider-scoped

---

## Fix

### Change 1 — `playwright/acg_restart.js`: add exclusion check to `_findScopedButton`

**Exact old block (lines 96–119):**

```javascript
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
        let node = el.parentElement;
        for (let j = 0; j < 8; j++) {
          if (!node) break;
          if (new RegExp(label, 'i').test(node.innerText || '')) return true;
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
```

**Exact new block:**

```javascript
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
```

---

### Change 2 — `playwright/acg_restart.js`: scope `deleteBtn` initial check and `openBtn`

**Exact old block (lines 282–296):**

```javascript
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
```

**Exact new block:**

```javascript
    // If Delete Sandbox is not immediately visible, click Open Sandbox to reveal the panel
    let deleteBtn = await _findScopedButton(page, 'Delete Sandbox', _providerCardLabel, 3000);
    if (!deleteBtn) {
      console.error('INFO: Delete Sandbox not visible — clicking Open Sandbox to reveal panel...');
      const openBtn = await _findScopedButton(page, 'Open Sandbox', _providerCardLabel, 5000);
      if (!openBtn) {
        const url = page.url();
        const btns = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .map(b => (b.innerText || b.textContent || '').trim())
            .filter(t => t.length > 0)
        ).catch(() => []);
        throw new Error(`Neither Delete Sandbox nor Open Sandbox visible. URL: ${url} | Buttons: ${JSON.stringify(btns)}`);
      }
      await openBtn.click({ force: true });
```

---

### Change 3 — `playwright/acg_restart.js`: scope `_startBtnPanel` and `deleteBtn` poll

**Exact old block (lines 297–324):**

```javascript
      // Poll for Delete Sandbox — dismiss Extend dialog on every tick so a late-appearing
      // dialog cannot block for more than one 500 ms interval.
      const _deletePollDeadline = Date.now() + 15000;
      let _deleteBtnReady = false;
      let _sandboxNotYetStarted = false;
      const _startBtnPanel = page.locator('button:has-text("Start Sandbox")').first();
      while (Date.now() < _deletePollDeadline) {
        await _dismissExtendYourSessionDialog(page);
        _deleteBtnReady = await deleteBtn.isVisible({ timeout: 500 }).catch(() => false);
        if (_deleteBtnReady) break;
        // Panel is open but sandbox not yet provisioned — Start Sandbox visible, Delete not.
        // Skip delete flow and start directly.
        if (await _startBtnPanel.isVisible({ timeout: 500 }).catch(() => false)) {
          _sandboxNotYetStarted = true;
          break;
        }
        await page.waitForTimeout(500).catch(() => {});
      }
      if (_sandboxNotYetStarted) {
        console.error('INFO: Sandbox panel open but not yet provisioned — clicking Start Sandbox directly...');
        await _startBtnPanel.scrollIntoViewIfNeeded().catch(() => {});
        await _startBtnPanel.click({ force: true });
        await page.waitForTimeout(3000);
        await _dismissExtendYourSessionDialog(page);
        console.error('INFO: Sandbox started. Ready for credential extraction.');
        console.log('RESTART_OK');
        return;
      }
```

**Exact new block:**

```javascript
      // Poll for Delete Sandbox — dismiss Extend dialog on every tick so a late-appearing
      // dialog cannot block for more than one 500 ms interval.
      const _deletePollDeadline = Date.now() + 15000;
      let _deleteBtnReady = false;
      let _sandboxNotYetStarted = false;
      let _startBtnPanelScoped = null;
      while (Date.now() < _deletePollDeadline) {
        await _dismissExtendYourSessionDialog(page);
        deleteBtn = await _findScopedButton(page, 'Delete Sandbox', _providerCardLabel, 0);
        _deleteBtnReady = deleteBtn !== null;
        if (_deleteBtnReady) break;
        // Panel is open but sandbox not yet provisioned — Start Sandbox visible, Delete not.
        // Skip delete flow and start directly.
        _startBtnPanelScoped = await _findScopedButton(page, 'Start Sandbox', _providerCardLabel, 0);
        if (_startBtnPanelScoped) {
          _sandboxNotYetStarted = true;
          break;
        }
        await page.waitForTimeout(500).catch(() => {});
      }
      if (_sandboxNotYetStarted) {
        console.error('INFO: Sandbox panel open but not yet provisioned — clicking Start Sandbox directly...');
        await _startBtnPanelScoped.scrollIntoViewIfNeeded().catch(() => {});
        await _startBtnPanelScoped.click({ force: true });
        await page.waitForTimeout(3000);
        await _dismissExtendYourSessionDialog(page);
        console.error('INFO: Sandbox started. Ready for credential extraction.');
        console.log('RESTART_OK');
        return;
      }
```

**Note on `timeoutMs = 0`:** `_findScopedButton` with `timeoutMs = 0` sets `deadline =
Date.now()`. The while condition `Date.now() <= deadline` is true on the first iteration
(both evaluated in the same tick), does a single DOM pass, then exits. This gives an
immediate non-blocking check — appropriate inside the 500ms-sleep poll loop.

---

## Files Changed

| File | Change |
|------|--------|
| `playwright/acg_restart.js` | Add exclusion check to `_findScopedButton`; scope `deleteBtn`, `openBtn`, `_startBtnPanel` to target provider |
| `CHANGELOG.md` | Add `[Unreleased]` entry under `### Fixed` |
| `memory-bank/activeContext.md` | Update current status |
| `memory-bank/progress.md` | Update v0.1.4 track |

---

## Rules

- `node --check playwright/acg_restart.js` — zero errors
- No other files touched

---

## Definition of Done

- [ ] `_findScopedButton` in `acg_restart.js` has `others` exclusion check — identical logic to `sandbox.js`'s version (`654f319`)
- [ ] `const deleteBtn = page.locator(...)` → `let deleteBtn = await _findScopedButton(page, 'Delete Sandbox', _providerCardLabel, 3000)`
- [ ] `const openBtn = page.locator(...)` → `const openBtn = await _findScopedButton(page, 'Open Sandbox', _providerCardLabel, 5000)`
- [ ] `const _startBtnPanel = page.locator(...)` removed; replaced with `let _startBtnPanelScoped = null`
- [ ] Poll loop uses `_findScopedButton(..., 0)` for both Delete and Start Sandbox checks
- [ ] `_sandboxNotYetStarted` path uses `_startBtnPanelScoped` (not `_startBtnPanel`)
- [ ] `node --check playwright/acg_restart.js` passes
- [ ] `make check lint test` passes (run in lib-acg repo root)
- [ ] `CHANGELOG.md` updated under `### Fixed`
- [ ] Committed and pushed to `feat/v0.1.4`
- [ ] `memory-bank/activeContext.md` and `memory-bank/progress.md` updated with commit SHA

**Commit message (exact):**
```
fix(acg_restart): add provider exclusion check to _findScopedButton; scope deleteBtn/openBtn/startBtnPanel
```

---

## What NOT to Do

- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT modify any file other than `playwright/acg_restart.js` (plus `CHANGELOG.md` and `memory-bank/`)
- Do NOT commit to `main` — work on `feat/v0.1.4`
- Do NOT change any other function in `acg_restart.js` beyond the three listed changes
- Do NOT change the fast-path `_deleteBtnCheck`/`_openBtnCheck` unscoped checks at lines 264–265 — those are intentionally unscoped (checking if ANY Delete/Open is present on the page, not just the target)
- Do NOT touch `sandbox.js`, `acg_credentials.js`, or any provider file
