#!/usr/bin/env bash
# scripts/plugins/acg.sh — ACG sandbox lifecycle
#
# Migrated from k3d-manager scripts/plugins/acg.sh in Phase 3.
#
# Public functions (after Phase 3):
#   acg_get_credentials   — extract AWS/GCP credentials from ACG sandbox UI
#   acg_import_credentials — import credentials from clipboard/CSV
#   acg_provision         — provision ACG CloudFormation stack
#   acg_status            — check ACG sandbox status
#   acg_extend            — extend sandbox TTL
#   acg_watch             — watch sandbox TTL and auto-extend
#   acg_watch_start       — start background TTL watcher
#   acg_watch_stop        — stop background TTL watcher
#   acg_chrome_cdp_install   — install launchd agent for persistent CDP Chrome
#   acg_chrome_cdp_uninstall — remove launchd agent
#   acg_teardown          — tear down ACG sandbox

# Phase 3: content migrated here from k3d-manager scripts/plugins/acg.sh
