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

# Sólo el servidor. Las migraciones corren una vez por despliegue, en el
# `release_command` de fly.toml: en el arranque las ejecutaba cada máquina que
# se levantaba, compitiendo entre ellas por el mismo `alembic upgrade head`.
#
# Un solo worker por defecto: sin REDIS_URL el limitador de intentos de login
# vive en la memoria del proceso, y con dos cada uno llevaba su propia cuenta
# (el límite real era el doble). Con REDIS_URL definido se puede subir
# WEB_CONCURRENCY; las tareas de fondo ya toleran varios procesos (SKIP LOCKED).
CMD uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers ${WEB_CONCURRENCY:-1}