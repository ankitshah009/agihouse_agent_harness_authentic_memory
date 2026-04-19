.PHONY: help venv install demo demo-tidb seed test build lint audit schema-tidb prewarm rehearse clean

help:
	@echo "Aubric AML — one-shot targets"
	@echo ""
	@echo "  make venv         Create ./venv and upgrade pip (idempotent)"
	@echo "  make install      Install pnpm + pip dependencies (auto-creates venv)"
	@echo "  make demo         Run the demo stack (SQLite backend)"
	@echo "  make demo-tidb    Run the demo stack against TiDB (needs DATABASE_URL)"
	@echo "  make seed         Execute scripts/run_demo.py (CLI replay)"
	@echo "  make test         Run the pytest smoke suite"
	@echo "  make build        Build the Next.js frontend"
	@echo "  make lint         Run the frontend linter"
	@echo "  make audit        pnpm audit --audit-level=high"
	@echo "  make schema-tidb  Apply the AML schema to TiDB Cloud via pymysql"
	@echo "  make prewarm      Warm the TiDB connection + Daytona sandbox"
	@echo "  make rehearse     Full dress rehearsal: install -> build -> test -> demo"
	@echo "  make clean        Remove caches, sqlite files, and audit bundles"

PYTHON ?= $(shell [ -f venv/bin/python ] && echo venv/bin/python || echo python3)

venv:
	@if [ -f venv/bin/python ]; then \
		echo "venv already exists at ./venv (no-op)"; \
	else \
		python3 -m venv venv && ./venv/bin/pip install --upgrade pip; \
	fi

install: venv
	pnpm install && $(PYTHON) -m pip install -r requirements.txt

demo:
	pnpm demo

demo-tidb:
	@if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	AML_BACKEND=tidb pnpm demo

seed:
	$(PYTHON) scripts/run_demo.py

test:
	$(PYTHON) -m pytest tests/ -v

build:
	pnpm run build

lint:
	pnpm run lint

audit:
	pnpm audit --audit-level=high

schema-tidb:
	@echo "Applying AML schema to TiDB Cloud via pymysql..."
	$(PYTHON) scripts/apply_tidb_schema.py

prewarm:
	curl -s -X POST http://127.0.0.1:9000/api/demo/prewarm && echo

rehearse: install build test demo

clean:
	rm -rf data/*.sqlite data/audit_*.json .next node_modules/.cache
