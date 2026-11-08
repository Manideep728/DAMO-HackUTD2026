.PHONY: setup dev backend frontend test eval rehearse warm promtool
setup: ## backend virtualenv and dependencies, frontend dependencies
	cd backend && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
	cd frontend && npm ci
dev: ## start backend (:8000) and frontend (:5173) together
	@$(MAKE) -j2 backend frontend
backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
frontend:
	cd frontend && npm run dev
test: ## engine, discovery, API and agent eval
	cd backend && .venv/bin/python -m pytest -q
eval: ## agent eval; EVAL_MODE=live runs it against Nemotron
	cd backend && EVAL_MODE=$${EVAL_MODE:-scripted} .venv/bin/python -m pytest -q tests/preflight/test_agent_eval.py
rehearse: ## click through docs/DEMO.md in a browser and check every number it quotes
	cd frontend && npx playwright test
warm: ## run read/find/prove once live so GAUNTLET_MODE=cached works offline
	cd backend && python -m app.warm
promtool: ## fetch promtool into backend/bin (linux amd64)
	mkdir -p backend/bin && curl -sSL https://github.com/prometheus/prometheus/releases/download/v3.2.1/prometheus-3.2.1.linux-amd64.tar.gz | tar xz -C /tmp && cp /tmp/prometheus-3.2.1.linux-amd64/promtool backend/bin/
