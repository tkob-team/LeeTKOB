# Quality gates. Targets never modify files; each runs backend, checker and
# frontend and exits non-zero if any of them fails. The frontend needs its
# dependencies installed once with `cd frontend && npm ci`.

SHELL := /bin/bash
.SHELLFLAGS := -c

MVN := sh ./mvnw -B -ntp
UV  := uv run --locked
NPM := npm run --silent

.PHONY: lint format-check typecheck test

# run_all <backend-cmd> <checker-cmd> <frontend-cmd>: run all three, fail if any failed.
define run_all
	@rc=0; \
	echo ">> backend: $(1)"; (cd backend && $(1)) || rc=1; \
	echo ">> checker: $(2)"; (cd checker && $(2)) || rc=1; \
	echo ">> frontend: $(3)"; (cd frontend && $(3)) || rc=1; \
	exit $$rc
endef

lint:
	$(call run_all,$(MVN) checkstyle:check,$(UV) ruff check --no-fix .,$(NPM) lint)

format-check:
	$(call run_all,$(MVN) spotless:check,$(UV) ruff format --check .,$(NPM) format:check)

typecheck:
	$(call run_all,$(MVN) test-compile,$(UV) mypy --strict,$(NPM) typecheck)

test:
	$(call run_all,$(MVN) test,$(UV) pytest,$(NPM) test)
