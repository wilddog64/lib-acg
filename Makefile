.PHONY: setup check lint help

help:
	@printf 'Targets:\n'
	@printf '  setup  — npm install + download Playwright Chromium browser\n'
	@printf '  check  — node --check all playwright/*.js files\n'
	@printf '  lint   — shellcheck all bin/ scripts\n'

setup:
	npm install
	npx playwright install chromium

check:
	node --check playwright/*.js

lint:
	shellcheck -S warning bin/acg-credential-test bin/acg-extend-test
