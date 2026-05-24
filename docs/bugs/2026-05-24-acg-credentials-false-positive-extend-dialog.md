# Bug: False-positive "Extend Your Session" dialog detection in acg_credentials.js

**Date:** 2026-05-24
**File:** `playwright/acg_credentials.js`
**Branch:** `fix/next-improvements-6`
**Commit:** `fb3ae33`

---

## Problem

`acg_credentials.js` prints `"Extend Your Session" dialog detected — clicking Cancel via DOM...`
on every `make up` run even when no dialog is visible on screen. This triggers the
`_waitForCredentials` 420s poll unconditionally, adding unnecessary delay.

**Root cause:** Two locations in `acg_credentials.js` check for the dialog with no visibility
guard:

1. Entry check (line ~248): `.some(d => ... && d.offsetParent !== null)` — missing
   `getComputedStyle` check for `display` and `visibility`.
2. Local `_dismissExtendYourSessionDialog` (line ~262): `.some(d => (d.innerText || '').includes('Extend Your Session'))` —
   no `offsetParent`, no `getComputedStyle` guard at all.

Pluralsight's SPA keeps the dialog element in the DOM between page renders. When the element
is hidden via `display:none` or `visibility:hidden`, `innerText` still returns non-empty text
on some browser builds, causing both checks to false-positive.

---

## Fix

Added `offsetParent !== null && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden'`
to both the entry check and the local `_dismissExtendYourSessionDialog` detection and find calls.
Matches the guard already present in `acg_restart.js`.

**Commit:** `fb3ae33` on `fix/next-improvements-6`

---

## Files Changed

| File | Change |
|------|--------|
| `playwright/acg_credentials.js` | Visibility guard on entry check + local dismiss function |
