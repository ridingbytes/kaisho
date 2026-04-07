.PHONY: install dev serve frontend build stop

# Install all dependencies (Python + frontend)
install:
	pip install -e .
	cd frontend && pnpm install

# Start backend and frontend for development
dev:
	@echo "Starting Kaisho..."
	@echo "  Backend:  http://localhost:8765"
	@echo "  Frontend: http://localhost:5173"
	@$(MAKE) -j2 serve frontend

# Backend only
serve:
	kai serve

# Frontend dev server only
frontend:
	cd frontend && pnpm dev

# Production frontend build
build:
	cd frontend && pnpm build

# Stop all dev processes
stop:
	-pkill -f "kai serve" 2>/dev/null || true
	-pkill -f "vite" 2>/dev/null || true
	@echo "Stopped."
