# Bug: Azure SP credentials chased via sandbox recreate (abuse-flagged) and device-code hangs forever

**Date:** 2026-06-12
**Repo:** lib-acg
**Branch:** `feat/v0.1.8`
**File:** `bin/acg-credential-test`

---

## Problem

The Azure sandbox service-principal (SP) credentials panel renders **intermittently** —
some draws expose `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`, some only username/password.
When the SP panel does not render, the current flow has two failure modes, both bad:

1. **Hang forever.** With only username/password present, Step 3 calls `_az_portal_valid`,
   which tries `az login -u/-p` (rejected under MFA enforcement, `AADSTS50126`) and falls
   back to `az login --use-device-code`. The device-code login can never complete headlessly
   (no enrolled second factor on the ephemeral user), and `wait "$az_pid"` (no timeout) blocks
   indefinitely until the device code expires (~15 min). Observed live: *"stuck here forever."*

2. **Abuse block.** The prior approach to the flaky SP panel was to **recreate the sandbox**
   (`_do_restart`) to draw fresh credentials. That auto-restart loop was already removed once
   as too fragile (`2026-06-11-azure-portal-only-restart-loop-removed.md`), and recreating
   sandboxes in a loop trips A Cloud Guru's abuse detector ("Ten or more instances created at
   a time" / "repeated detected misuse") — the account gets **temporarily blocked**. Confirmed
   by an ACG block email on 2026-06-12.

**Root cause:** the SP panel is a *render* flake, not a sandbox-provisioning flake — so the
correct remedy is to **reload the sandbox page and re-extract** (which does NOT create a new
instance), not to recreate the sandbox. The extractor already reads `AZURE_CLIENT_ID`/
`AZURE_CLIENT_SECRET` correctly once the fields render (`2026-06-07-azure-client-id-secret-not-extracted.md`).
Re-running `acg_credentials.js` reloads the page, so the SP panel gets another chance to
render with zero instance creation.

---

## Reproduction

```bash
# Draw an Azure sandbox whose SP panel does not render:
bin/acg-credential-test "<sandbox-url>" --provider azure
# → AZURE_USERNAME/AZURE_PASSWORD only (no AZURE_CLIENT_ID/SECRET)
# → "Username/password login failed (MFA enforcement) — automating device code via browser."
# → "Automating device sign-in in browser (url=... code=XXXX)."
# → hangs forever on wait "$az_pid"
```

---

## Fix

Two changes, both in `bin/acg-credential-test`:

1. **Step 3 dispatch** — replace the flat if/elif with a bounded loop that prefers **cheap
   page-reload re-extracts** (no new instance) to catch the flaky SP panel, allows **at most
   one** sandbox recreate (with a cooldown) as an escape hatch, then falls back to device-code.
2. **`_az_portal_valid`** — bound the device-code `wait` with a timeout so it fails fast instead
   of hanging, surfacing the actionable error.

All limits are env-tunable (integers):

| Env var | Default | Meaning |
|---------|---------|---------|
| `AZURE_SP_EXTRACT_ATTEMPTS` | `5` | page-reload re-extracts per pass (NO instance created) |
| `AZURE_SP_RECREATE_MAX` | `1` | sandbox recreates allowed (new instance) |
| `AZURE_SP_RECREATE_COOLDOWN` | `30` | seconds to sleep before a recreate (ACG rate-limit safety) |
| `AZURE_DEVICE_CODE_TIMEOUT` | `120` | seconds to wait for device-code login before aborting |

---

### Change 1 — `bin/acg-credential-test`: re-extract-first Step 3 dispatch

**Exact old block (lines 300–333):**

```bash
# Step 3: validate Azure creds — CLI auth first, portal/TAP only when no CLI path exists
if grep -q '^AZURE_CLIENT_ID=' "$_tmpout" && grep -q '^AZURE_CLIENT_SECRET=' "$_tmpout"; then
  if _az_sp_valid; then
    printf 'INFO: Azure SP credentials validated (az login + token probe OK)\n' >&2
    _write_azure_credentials
  else
    printf 'WARN: Azure SP validation failed — restarting sandbox for fresh credentials...\n' >&2
    _do_restart "$@"
    _wait_cdp_ready
    _extract_credentials "$@" || {
      printf 'ERROR: Credential extraction failed after SP validation restart.\n' >&2
      exit 1
    }
    _print_masked
    if _az_sp_valid; then
      printf 'INFO: Azure SP credentials validated after restart (az login + token probe OK)\n' >&2
      _write_azure_credentials
    else
      _azure_auth_failed 'ERROR: Azure CLI auth failed — service-principal credentials invalid after all attempts.'
    fi
  fi
elif grep -q '^AZURE_CLIENT_ID=' "$_tmpout"; then
  if _az_identity_valid; then
    printf 'INFO: Azure identity credentials validated (az login + token probe OK)\n' >&2
  else
    _azure_auth_failed 'ERROR: Azure CLI auth failed — identity credentials invalid after all attempts.'
  fi
elif grep -q '^AZURE_USERNAME=' "$_tmpout" && grep -q '^AZURE_PASSWORD=' "$_tmpout"; then
  if _az_portal_valid; then
    printf 'INFO: Azure portal credentials validated (az login + token probe OK)\n' >&2
  else
    _azure_auth_failed 'ERROR: Azure portal-only sandbox detected — MFA prevents login (no SP credentials provisioned). Delete this sandbox and start a new one to get SP credentials.'
  fi
fi
```

**Exact new block:**

```bash
# Step 3: validate Azure creds — prefer SP (CLI auth); identity; device-code last.
# The SP credentials panel renders intermittently. Re-extract (page RELOAD via
# acg_credentials.js — does NOT create a sandbox instance) up to
# AZURE_SP_EXTRACT_ATTEMPTS times to catch it before allowing at most
# AZURE_SP_RECREATE_MAX sandbox recreates. Recreating sandboxes in a loop trips
# ACG abuse detection, so recreate is strictly capped and cooldown-gated.
if grep -q '^AZURE_CLIENT_ID=' "$_tmpout" || grep -q '^AZURE_USERNAME=' "$_tmpout"; then
  _az_sp_extract_attempts="${AZURE_SP_EXTRACT_ATTEMPTS:-5}"
  _az_sp_recreate_max="${AZURE_SP_RECREATE_MAX:-1}"
  _az_sp_recreate_cooldown="${AZURE_SP_RECREATE_COOLDOWN:-30}"
  _az_recreate_count=0
  _az_done=false

  while [[ "$_az_done" == "false" ]]; do
    _az_i=0
    while ! { grep -q '^AZURE_CLIENT_ID=' "$_tmpout" && grep -q '^AZURE_CLIENT_SECRET=' "$_tmpout"; }; do
      _az_i=$(( _az_i + 1 ))
      if (( _az_i > _az_sp_extract_attempts )); then
        break
      fi
      printf 'INFO: Azure SP panel not rendered — reloading sandbox page (re-extract %d/%d, no new instance)...\n' \
        "$_az_i" "$_az_sp_extract_attempts" >&2
      _extract_credentials "$@" || true
      _print_masked
    done

    if grep -q '^AZURE_CLIENT_ID=' "$_tmpout" && grep -q '^AZURE_CLIENT_SECRET=' "$_tmpout"; then
      if _az_sp_valid; then
        printf 'INFO: Azure SP credentials validated (az login + token probe OK)\n' >&2
        _write_azure_credentials
        _az_done=true
        break
      fi
      printf 'WARN: Azure SP credentials present but validation failed.\n' >&2
    elif grep -q '^AZURE_CLIENT_ID=' "$_tmpout"; then
      if _az_identity_valid; then
        printf 'INFO: Azure identity credentials validated (az login + token probe OK)\n' >&2
        _az_done=true
        break
      fi
      printf 'WARN: Azure identity credentials present but validation failed.\n' >&2
    fi

    if (( _az_recreate_count >= _az_sp_recreate_max )); then
      break
    fi
    _az_recreate_count=$(( _az_recreate_count + 1 ))
    printf 'WARN: Recreating sandbox for SP credentials (recreate %d/%d) — cooling down %ds to respect ACG rate limits...\n' \
      "$_az_recreate_count" "$_az_sp_recreate_max" "$_az_sp_recreate_cooldown" >&2
    sleep "$_az_sp_recreate_cooldown"
    _do_restart "$@"
    _wait_cdp_ready
    _extract_credentials "$@" || {
      printf 'ERROR: Credential extraction failed after sandbox recreate.\n' >&2
      exit 1
    }
    _print_masked
  done

  if [[ "$_az_done" == "false" ]]; then
    if grep -q '^AZURE_USERNAME=' "$_tmpout" && grep -q '^AZURE_PASSWORD=' "$_tmpout" && _az_portal_valid; then
      printf 'INFO: Azure portal credentials validated (az login + token probe OK)\n' >&2
    else
      _azure_auth_failed 'ERROR: Azure SP credentials unavailable after re-extract + single recreate, and device-code fallback failed. Delete this sandbox and start a new one to get SP credentials.'
    fi
  fi
fi
```

---

### Change 2 — `bin/acg-credential-test`: declare device-code timeout locals in `_az_portal_valid`

**Exact old block (line 166):**

```bash
  local username password tenant config_dir device_tmp az_pid device_url device_code _i
```

**Exact new block:**

```bash
  local username password tenant config_dir device_tmp az_pid device_url device_code _i _dc_timeout _dc_waited
```

---

### Change 3 — `bin/acg-credential-test`: bound the device-code `wait` in `_az_portal_valid`

**Exact old block (lines 209–212):**

```bash
  wait "$az_pid" || {
    AZURE_LOGIN_ERROR='az login --use-device-code failed after browser automation'
    return 1
  }
```

**Exact new block:**

```bash
  _dc_timeout="${AZURE_DEVICE_CODE_TIMEOUT:-120}"
  _dc_waited=0
  while kill -0 "$az_pid" 2>/dev/null; do
    if (( _dc_waited >= _dc_timeout )); then
      printf 'ERROR: Device-code login did not complete within %ds — aborting (no sandbox recreate).\n' "$_dc_timeout" >&2
      kill "$az_pid" 2>/dev/null || true
      AZURE_LOGIN_ERROR='az login --use-device-code timed out before completion'
      return 1
    fi
    sleep 1
    _dc_waited=$(( _dc_waited + 1 ))
  done
  wait "$az_pid" || {
    AZURE_LOGIN_ERROR='az login --use-device-code failed after browser automation'
    return 1
  }
```

---

## Files Changed

| File | Change |
|------|--------|
| `bin/acg-credential-test` | Re-extract-first Step 3 dispatch (cap 1 recreate, cooldown); bound device-code `wait` with timeout |

---

## Rules

- `shellcheck -S warning bin/acg-credential-test` — zero new warnings
- No other files touched (do NOT modify `playwright/` or any Node files)
- `_do_restart` is called **at most once** per run (guarded by `AZURE_SP_RECREATE_MAX`, default 1)
- Re-extract (`_extract_credentials`) must be the primary retry — it reloads the page and
  creates **no** sandbox instance
- Preserve `set -euo pipefail` behavior: all `(( ))` arithmetic stays inside `if`/`while`
  conditions (a bare `(( x > y ))` that evaluates false returns exit 1 and would abort)

---

## Definition of Done

- [ ] Step 3 re-extract loop added; `_extract_credentials` is the primary retry (no `_do_restart` before re-extract exhausts)
- [ ] `_do_restart` capped at `AZURE_SP_RECREATE_MAX` (default 1) with `AZURE_SP_RECREATE_COOLDOWN` sleep before each recreate
- [ ] Device-code fallback only runs after the SP loop exhausts
- [ ] `_az_portal_valid` `wait` is bounded by `AZURE_DEVICE_CODE_TIMEOUT` (default 120s) and no longer hangs
- [ ] `_dc_timeout _dc_waited` added to the `_az_portal_valid` `local` declaration
- [ ] SP and identity validation helpers (`_az_sp_valid`, `_az_identity_valid`) unchanged
- [ ] `shellcheck -S warning bin/acg-credential-test` passes with zero new warnings
- [ ] Static dry-check (no live sandbox — account is temporarily ACG-blocked): with a fixture
      `_tmpout` containing only `AZURE_USERNAME=`/`AZURE_PASSWORD=`, confirm the device-code
      path returns within `AZURE_DEVICE_CODE_TIMEOUT` instead of hanging (set it to e.g. 3 for the check)
- [ ] Committed and pushed to `feat/v0.1.8`
- [ ] memory-bank updated with commit SHA and task status (in k3d-manager repo)

**Commit message (exact):**
```
fix(credential-test): re-extract Azure SP panel before recreate; bound device-code wait
```

---

## What NOT to Do

- Do NOT create a PR — Claude handles PR creation after verifying the commit
- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT modify any file other than `bin/acg-credential-test`
- Do NOT raise `AZURE_SP_RECREATE_MAX` above 1 in the code default — recreating sandboxes in a
  loop is what triggers ACG's abuse block; re-extract (page reload) is the safe retry
- Do NOT reintroduce an unbounded restart loop (removed in `2026-06-11-azure-portal-only-restart-loop-removed.md`)
- Do NOT touch `playwright/acg_restart.js`, `acg_credentials.js`, or `providers/azure.js`
- Do NOT commit to `main` — work on `feat/v0.1.8`
- Do NOT live-test against an Azure sandbox until the ACG temporary block clears — this fix is
  static/shellcheck-verifiable; runtime verification waits for the block to lift
```