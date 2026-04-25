#!/usr/bin/env bash
# scripts/lib/cdp.sh — Chrome CDP primitives
#
# Migrated from k3d-manager scripts/plugins/gemini.sh in Phase 3.
#
# Public functions (after Phase 3):
#   _browser_launch           — ensure Chrome is running with --remote-debugging-port=9222
#   _cdp_ensure_acg_session   — verify Pluralsight session is active in CDP browser
#
# Dependencies: lib-foundation (scripts/lib/foundation/scripts/lib/system.sh)
#   _antigravity_browser_ready, _info, _run_command, _command_exist

# Phase 3: content migrated here from k3d-manager scripts/plugins/gemini.sh
