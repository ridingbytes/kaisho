# ============================================================
# Kaisho — multi-stage Docker build
# Stage 1: build frontend (Node)
# Stage 2: runtime (Python)
# ============================================================

# -- Stage 1: Frontend build --------------------------------
FROM node:22-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm build


# -- Stage 2: Python runtime --------------------------------
FROM python:3.12-slim

# Avoid .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e .

# Copy application code
COPY kaisho/ kaisho/
COPY templates/ templates/
COPY prompts/ prompts/

# Copy built frontend from stage 1
COPY --from=frontend /build/dist frontend/dist

# Data volume — customer data persists here
VOLUME /app/data
ENV KAISHO_HOME=/app/data \
    SERVE_FRONTEND=true

# Default port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/health')" || exit 1

# Run the server
CMD ["kai", "serve", "--host", "0.0.0.0", "--port", "8765"]
