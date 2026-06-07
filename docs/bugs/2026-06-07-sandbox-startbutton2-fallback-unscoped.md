# Bugfix: v0.1.4 — startButton2 fallback picks wrong provider's Start Sandbox

**Branch:** `feat/v0.1.4`
**Files:** `playwright/lib/sandbox.js`, `CHANGELOG.md`, `memory-bank/activeContext.md`, `memory-bank/progress.md`

---

## Problem

After deleting the conflicting sandbox (e.g. AWS) and clicking the target provider's "Open
Sandbox", `startSandbox` searches for the provider-scoped "Start Sandbox" button with a
30s timeout. If that search returns null, the fallback loop (added in `5878dcf`) iterates
all visible+enabled "Start Sandbox" buttons on the page **without any provider filter**.

At that moment the page shows TWO "Start Sandbox" buttons:
1. The deleted sandbox's card (e.g. AWS — deleted, showing "Start Sandbox" to re-provision)
2. The target provider's panel (e.g. Azure — just opened, waiting to be started)

The fallback picks the first one in DOM order, which is typically the wrong provider's
card (AWS comes before Azure). The wrong sandbox starts; `_waitForCredentials` sees the
wrong provider's credentials populate; the target provider's extractor then times out.

**Symptom from live test log:**
```
WARN: Scoped Start Sandbox not found for Azure — trying any visible enabled Start Sandbox as fallback...
INFO: Clicking Start Sandbox (Step 2)...
INFO: Waiting for Azure credentials to populate (up to 420s)...
ERROR: page.waitForFunction: Timeout 30000ms exceeded
```
Then `acg_restart.js` deletes the wrong-provider sandbox, and the second
`acg_credentials.js` run sees the wrong provider running again — cycling indefinitely.

**Root cause (lines 353–363):** the fallback loop at lines 353–363 selects the first
visible+enabled "Start Sandbox" button with no ancestor walk and no provider exclusion
check, so it can click a button belonging to a provider card other than the target.

---

## Fix

### Change 1 — `playwright/lib/sandbox.js`: add provider exclusion check to the fallback loop

**Exact old block (lines 352–363):**

```javascript
    let startButton2 = await _findScopedButton(page, 'Start Sandbox', providerLabel, 30000);
    if (!startButton2) {
      console.error(`WARN: Scoped Start Sandbox not found for ${providerLabel} — trying any visible enabled Start Sandbox as fallback...`);
      const allStart = page.locator('button:has-text("Start Sandbox")');
      const count = await allStart.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const btn = allStart.nth(i);
        const visible = await btn.isVisible({ timeout: 300 }).catch(() => false);
        const enabled = await btn.isEnabled({ timeout: 300 }).catch(() => false);
        if (visible && enabled) { startButton2 = btn; break; }
      }
    }
```

**Exact new block:**

```javascript
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
          for (let j = 0; j < 8; j++) {
            if (!node) break;
            const t = node.innerText || '';
            if (new RegExp(pLabel, 'i').test(t) && !others.some(p => t.includes(p))) return true;
            node = node.parentElement;
          }
          return false;
        }, [providerLabel, _fbOthers]).catch(() => false);
        if (inTargetCard) { startButton2 = btn; break; }
      }
    }
```

**Why this works:** the ancestor walk (8 levels, same depth as `_findScopedButton`) checks
that the button's container has the target provider label AND does NOT contain any other
provider keyword. The individual Azure card has "Azure" but not "AWS"/"GCP"; the deleted
AWS card has "AWS" but not "Azure" — so only the correct target button is selected.

---

## Files Changed

| File | Change |
|------|--------|
| `playwright/lib/sandbox.js` | Add provider exclusion check to `startButton2` fallback loop |
| `CHANGELOG.md` | Add `[Unreleased]` entry under `### Fixed` |
| `memory-bank/activeContext.md` | Update current status |
| `memory-bank/progress.md` | Update v0.1.4 track |

---

## Rules

- `node --check playwright/lib/sandbox.js` — zero errors
- No other files touched

---

## Definition of Done

- [ ] Fallback log message changed from `"trying any visible enabled Start Sandbox as fallback..."` to `"trying provider-scoped fallback..."`
- [ ] `_fbOthers` computed via `.filter(p => !new RegExp(p, 'i').test(providerLabel))`
- [ ] Fallback loop skips buttons whose ancestors do not satisfy `(providerLabel matches) && !(any other provider matches)`
- [ ] `if (visible && enabled) { startButton2 = btn; break; }` replaced with `if (!visible || !enabled) continue;` + evaluate check + `if (inTargetCard) { startButton2 = btn; break; }`
- [ ] `node --check playwright/lib/sandbox.js` passes
- [ ] `make check lint test` passes (run in lib-acg repo root)
- [ ] `CHANGELOG.md` updated under `### Fixed`
- [ ] Committed and pushed to `feat/v0.1.4`
- [ ] `memory-bank/activeContext.md` and `memory-bank/progress.md` updated with commit SHA

**Commit message (exact):**
```
fix(sandbox): add provider exclusion check to startButton2 fallback — prevents clicking wrong sandbox
```

---

## What NOT to Do

- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT modify any file other than `playwright/lib/sandbox.js` (plus `CHANGELOG.md` and `memory-bank/`)
- Do NOT commit to `main` — work on `feat/v0.1.4`
- Do NOT change `_findScopedButton`, `_waitForCredentials`, `_deleteConflictingSandbox`, or any other function
- Do NOT remove the fallback entirely — only add the provider exclusion check to it
- Do NOT touch `azure.js`, `acg_credentials.js`, `acg_restart.js`, or any provider file
