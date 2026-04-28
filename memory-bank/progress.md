# Progress — lib-acg

## v0.1.0 Track (branch: `main`)

- [x] **Repo skeleton** — COMPLETE. CLAUDE.md, README.md, package.json, placeholder
      scripts/lib/cdp.sh, scripts/plugins/acg.sh, scripts/plugins/gcp.sh, scripts/vars.sh,
      playwright/, memory-bank/.
- [x] **lib-foundation subtree** — COMPLETE. Present under scripts/lib/foundation/.
- [x] **Phase 3 migration** — COMPLETE (`5c0e8e2`). Copied acg.sh, gcp.sh, playwright/*.js, vars.sh from
      k3d-manager; extracted _browser_launch + _cdp_ensure_acg_session into cdp.sh.
- [x] **Pre-commit hooks / CI** — COMPLETE (`5c0e8e2`). GitHub Actions and pre-commit hook are present.
- [x] **ACG credential extraction misses visible sandbox** — FIXED in PR #2 (`https://github.com/wilddog64/lib-acg/pull/2`). Fix branch `fix/acg-credentials-cdp-context-reuse` updates AWS sandbox URL, CDP context reuse, `/hands-on` retry, sanitized diagnostics, and macOS Chrome launch. Copilot review follow-ups replaced the fixed retry sleep with a DOM readiness/link/text condition, clarified the intentional failure fallthrough, and fixed repo-local fallback paste commands. Local checks passed: `npm run check`, `node --check playwright/acg_credentials.js`, and `shellcheck scripts/**/*.sh`. Bug: `docs/bugs/2026-04-28-acg-credentials-cdp-context-miss.md`.
- [ ] **BATS tests** — PLANNED. Add tests/lib/cdp.bats for cdp.sh primitives.
