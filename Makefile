.PHONY: help install demo demo-tidb seed test build lint audit schema-tidb prewarm rehearse clean

help:
	@echo "Aubric AML — one-shot targets"
	@echo ""
	@echo "  make install      Install pnpm + pip dependencies"
	@echo "  make demo         Run the demo stack (SQLite backend)"
	@echo "  make demo-tidb    Run the demo stack against TiDB (needs DATABASE_URL)"
	@echo "  make seed         Execute scripts/run_demo.py (CLI replay)"
	@echo "  make test         Run the pytest smoke suite"
	@echo "  make build        Build the Next.js frontend"
	@echo "  make lint         Run the frontend linter"
	@echo "  make audit        pnpm audit --audit-level=high"
	@echo "  make schema-tidb  Print the mysql command to apply the TiDB schema"
	@echo "  make prewarm      Warm the TiDB connection + Daytona sandbox"
	@echo "  make rehearse     Full dress rehearsal: install -> build -> test -> demo"
	@echo "  make clean        Remove caches, sqlite files, and audit bundles"

install:
	pnpm install && pip install -r requirements.txt

demo:
	pnpm demo

demo-tidb:
	@if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
	AML_BACKEND=tidb pnpm demo

seed:
	python scripts/run_demo.py

test:
	pytest tests/ -v

build:
	pnpm run build

lint:
	pnpm run lint

audit:
	pnpm audit --audit-level=high

schema-tidb:
	@echo "Apply schema via: mysql -h HOST -P 4000 -u USER -p DATABASE < schema/ddl/aml_tidb_schema.sql"

prewarm:
	curl -s -X POST http://127.0.0.1:9000/api/demo/prewarm && echo

rehearse: install build test demo

clean:
	rm -rf data/*.sqlite data/audit_*.json .next node_modules/.cache
