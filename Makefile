.PHONY: setup check lint credential-test extend-test help

help:
	@printf 'Targets:\n'
	@printf '  setup             — npm install + download Playwright Chromium browser\n'
	@printf '  check             — node --check all playwright/*.js files\n'
	@printf '  lint              — shellcheck all bin/ scripts\n'
	@printf '  credential-test   — run bin/acg-credential-test (requires SANDBOX_URL=<url>)\n'
	@printf '                      optional: PROVIDER=aws|gcp\n'
	@printf '  extend-test       — run bin/acg-extend-test (requires SANDBOX_URL=<url>)\n'

setup:
	npm install
	npx playwright install chromium
	git config core.hooksPath .githooks

check:
	node --check playwright/*.js

lint:
	shellcheck -S warning bin/acg-credential-test bin/acg-extend-test

credential-test:
	@if [ -z "$(SANDBOX_URL)" ]; then printf 'Usage: make credential-test SANDBOX_URL=<url> [PROVIDER=aws|gcp]\n' >&2; exit 1; fi
	bin/acg-credential-test "$(SANDBOX_URL)" $(if $(PROVIDER),--provider "$(PROVIDER)",)

extend-test:
	@if [ -z "$(SANDBOX_URL)" ]; then printf 'Usage: make extend-test SANDBOX_URL=<url>\n' >&2; exit 1; fi
	bin/acg-extend-test "$(SANDBOX_URL)"
