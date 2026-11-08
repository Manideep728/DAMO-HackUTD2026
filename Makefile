.PHONY: dev backend frontend warm promtool
dev: ## start backend (:8000) and frontend (:5173) together
	@$(MAKE) -j2 backend frontend
backend:
	cd backend && uvicorn app.main:app --reload --port 8000
frontend:
	cd frontend && npm run dev
warm: ## run read/find/prove once live so GAUNTLET_MODE=cached works offline
	cd backend && python -m app.warm
promtool: ## fetch promtool into backend/bin (linux amd64)
	mkdir -p backend/bin && curl -sSL https://github.com/prometheus/prometheus/releases/download/v3.2.1/prometheus-3.2.1.linux-amd64.tar.gz | tar xz -C /tmp && cp /tmp/prometheus-3.2.1.linux-amd64/promtool backend/bin/
