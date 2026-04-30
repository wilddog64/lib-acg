# Active Context — lib-acg

## Current Branch: `feat/acg-extend-modal-wait`

**Repo created:** 2026-04-25
**Status:** Phase 3 migration and Phase 5 CI content are on `main` (`5c0e8e2`). Current work fixes ACG session extension timing so the watcher can reliably find the extend surface after clicking Open Sandbox.

## Phase Status

- [x] **Phase 2** — COMPLETE. Repo skeleton created; lib-foundation subtree pending.
- [x] **Phase 3** — COMPLETE. Migrated acg.sh, gcp.sh, playwright scripts, vars.sh, and
      extracted _browser_launch + _cdp_ensure_acg_session into scripts/lib/cdp.sh.
      Source commit on main: `5c0e8e2`.
- [x] **ACG credential extraction misses visible sandbox** — FIXED in PR #2 (`https://github.com/wilddog64/lib-acg/pull/2`). Copilot review comments addressed and both inline threads resolved. Latest code commit `1ddbf7c` has GitHub Actions CI green; local checks passed (`npm run check`, `node --check playwright/acg_credentials.js`, `shellcheck scripts/**/*.sh`). Merge is blocked only because the PR is still draft: connector ready-for-review mutation failed with a response-shape error, shell GitHub token returned 401, and GitHub rejected merge with `Pull Request is still a draft`. Bug: `docs/bugs/2026-04-28-acg-credentials-cdp-context-miss.md`.
- [ ] **ACG extend surface timing gap** — IN PROGRESS. `playwright/acg_extend.js` now dismisses lingering confirmation modals, polls for the extend button after clicking Open Sandbox, and captures a failure screenshot if the surface never appears. PR #3 (`https://github.com/wilddog64/lib-acg/pull/3`), commit `c442490`. Bug: `docs/bugs/2026-04-26-acg-extend-session-extended-modal-blocks-button.md`.

## Consumed By

- `k3d-manager` — will pull via git subtree at `scripts/lib/acg/` (Phase 4)
