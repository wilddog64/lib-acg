.PHONY: setup check lint test credential-test extend-test help

SANDBOX_URL ?= https://app.pluralsight.com/hands-on/playground/cloud-sandboxes
PROVIDER ?= aws

help:
	@printf 'Targets:\n'
	@printf '  setup             — npm install + download Playwright Chromium browser\n'
	@printf '  check             — node --check all playwright/*.js files\n'
	@printf '  lint              — shellcheck all bin/ scripts\n'
	@printf '  test              — run fixture-based Playwright tests (no live session needed)\n'
	@printf '  credential-test   — run bin/acg-credential-test (default: ACG portal URL, aws provider)\n'
	@printf '                      optional: PROVIDER=aws|gcp|azure SANDBOX_URL=<url>\n'
	@printf '  extend-test       — run bin/acg-extend-test (default: ACG portal URL, aws provider)\n'
	@printf '                      optional: PROVIDER=aws|gcp|azure SANDBOX_URL=<url>\n'

setup:
	npm install
	npx playwright install chromium
	git config core.hooksPath .githooks

check:
	node --check playwright/*.js

test:
	npx playwright test --config playwright.config.js

lint:
	shellcheck -S warning bin/acg-credential-test bin/acg-extend-test

credential-test:
	bin/acg-credential-test "$(SANDBOX_URL)" --provider "$(PROVIDER)"

extend-test:
	bin/acg-extend-test "$(SANDBOX_URL)" --provider "$(PROVIDER)"
