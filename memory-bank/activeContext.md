# Active Context — lib-acg

## Current Branch: `fix/post-merge-pr9-cleanup`

**Repo created:** 2026-04-25
**Status:** Post-merge cleanup after PR #9. Fixes `launchctl bootout` regression, adds missing retros, corrects stale memory-bank.

## Phase Status

- [x] **Phase 2** — COMPLETE. Repo skeleton created; lib-foundation subtree present.
- [x] **Phase 3** — COMPLETE. Migrated acg.sh, gcp.sh, playwright scripts, vars.sh, and
      extracted _browser_launch + _cdp_ensure_acg_session into scripts/lib/cdp.sh.
      Source commit on main: `5c0e8e2`.
- [x] **ACG credential extraction misses visible sandbox** — FIXED, MERGED PR #2.
      Bug: `docs/bugs/2026-04-28-acg-credentials-cdp-context-miss.md`.
- [x] **ACG extend surface timing gap** — FIXED, MERGED PR #3.
      Bug: `docs/bugs/2026-04-26-acg-extend-session-extended-modal-blocks-button.md`.
- [x] **acg_credentials waitForFunction timeout** — FIXED, MERGED PR #4 (`076f65d`).
      Spec: `docs/plans/bugfix-acg-credentials-waitforfunction-timeout.md`.
- [x] **acg_credentials timeout values** — FIXED, MERGED PR #5 (`f744901`).
- [x] **acg_credentials provision timeout** — FIXED, MERGED PR #6 (`671b8b23`).
- [x] **CDP empty-contexts fix** — MERGED PR #7 (`027b5765`).
      Retro: `docs/retro/2026-05-02-pr7-cdp-empty-contexts-retrospective.md`.
- [x] **CDP reconnect after blank tab** — MERGED PR #8 (`30917444`).
      Bug: `docs/bugs/2026-05-02-acg-credentials-cdp-reconnect-after-blank-tab.md`.
      Retro: `docs/retro/2026-05-02-pr8-cdp-reconnect-retrospective.md`.
- [x] **Chrome SingletonLock collision** — MERGED PR #9 (`79a6acdd`).
      Bug: `docs/bugs/2026-05-02-chrome-singleton-lock-collision.md`.
      Retro: `docs/retro/2026-05-03-pr9-chrome-singleton-lock-retrospective.md`.
      Post-merge fix: `launchctl bootout` replaces deprecated `launchctl unload`.

## Open: Post-merge PR #9 cleanup (IN PROGRESS)

Branch: `fix/post-merge-pr9-cleanup`
- [ ] Fix `launchctl unload` → `launchctl bootout` in `scripts/lib/cdp.sh`
- [ ] Add missing retros for PR #7, #8, #9 under `docs/retro/`
- [ ] Correct stale memory-bank (activeContext.md + progress.md)

## Consumed By

- `k3d-manager` — will pull via git subtree at `scripts/lib/acg/` (Phase 4)
