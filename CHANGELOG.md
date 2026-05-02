# Changelog

All notable changes to lib-acg will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed
- `_waitForSandboxEntry`: pass `null` as `waitForFunction` arg so the timeout option reaches the options slot (same arg-slot bug as `_waitForCredentials`)
- `_waitForCredentials`: increase timeout from 60s to 180s — sandbox provisioning can take 60–120s
- `OVERALL_TIMEOUT_MS`: increase non-first-run timeout from 120s to 300s — matches the expanded credential wait headroom
- `_waitForCredentials`: pass `null` as `waitForFunction` arg so the 60s credential timeout reaches the options slot instead of defaulting to 30s

### Added
- CI workflow: shellcheck, node --check, yamllint on PRs to main
- Pre-commit hook: subtree guard + shellcheck + node --check on staged files
- Phase 3 migration: acg.sh, gcp.sh, cdp.sh, vars.sh, playwright scripts, acg-cluster.yaml
