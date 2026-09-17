FROM python:3.11-slim

WORKDIR /app

# System deps mínimos
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Python deps - cache layer
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Usuario no-root (seguridad)
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Puerto Fly usa 8080
EXPOSE 8080

# Start: migraciones + server
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 2