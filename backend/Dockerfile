# ---------- stage 1: build ----------
FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.6 /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml .python-version ./
RUN uv sync --no-dev --no-install-project

COPY app/ ./app/

# ---------- stage 2: runtime ----------
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/app /app/app

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
