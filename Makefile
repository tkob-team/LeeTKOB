# Quality gates. Targets never modify files; each runs backend and checker
# and exits non-zero if either fails.

SHELL := /bin/bash
.SHELLFLAGS := -c

MVN := sh ./mvnw -B -ntp
UV  := uv run --locked

.PHONY: lint format-check typecheck test

# run_both <backend-cmd> <checker-cmd>: run both, fail if either failed.
define run_both
	@rc=0; \
	echo ">> backend: $(1)"; (cd backend && $(1)) || rc=1; \
	echo ">> checker: $(2)"; (cd checker && $(2)) || rc=1; \
	exit $$rc
endef

lint:
	$(call run_both,$(MVN) checkstyle:check,$(UV) ruff check --no-fix .)

format-check:
	$(call run_both,$(MVN) spotless:check,$(UV) ruff format --check .)

typecheck:
	$(call run_both,$(MVN) test-compile,$(UV) mypy --strict)

test:
	$(call run_both,$(MVN) test,$(UV) pytest)
