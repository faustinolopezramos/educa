# Educa - Deployment Guide (Supabase + Fly.io + Vercel)

## Arquitectura
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│  Supabase   │◀───▶│   Fly.io    │
│  (Frontend) │     │ (PostgreSQL  │     │  (Backend)  │
│  React+Vite │     │  + Auth)    │     │  FastAPI    │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## 1. Supabase Setup (5 min)

### Crear proyecto
1. https://supabase.com → **New Project**
2. Nombre: `educa-prod`
3. Región: más cercana a usuarios
4. Guardar credenciales:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon Key**: `eyJhbGciOiJIUzI1NiIs...`
   - **Service Role Key**: `eyJhbGciOiJIUzI1NiIs...` (solo backend)

### Configurar Connection Pooling
- Settings → Database → Connection Pooling
- Mode: **Transaction** (PgBouncer)
- Copiar URI: `postgresql://postgres:[pwd]@aws-0-[region].pooler.supabase.com:6543/postgres`

### Configurar Auth
- Authentication → Providers → Email → **Disable "Confirm email"**
- Authentication → URL Configuration:
  - Site URL: `https://tu-app.vercel.app`
  - Redirect URLs: `https://tu-app.vercel.app/**`

---

## 2. Fly.io Backend (10 min)

### Instalar flyctl
```bash
# macOS
brew install flyctl
# Linux
curl -L https://fly.io/install.sh | sh
```

### Login y crear app
```bash
flyctl auth login
flyctl apps create educa-backend  # nombre único global
```

### Configurar secrets (en terminal)
```bash
cd backend
flyctl secrets set \
  ENVIRONMENT=production \
  DATABASE_URL="postgresql+psycopg://postgres:[PWD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true" \
  JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  FERNET_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
  WEBHOOK_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')" \
  CORS_ORIGINS="https://tu-app.vercel.app" \
  TRUST_PROXY_HEADERS="true" \
  ACADEMY_TIMEZONE="America/Guatemala"
```

### Deploy
```bash
flyctl deploy
# Ver logs: flyctl logs -a educa-backend
# URL: https://educa-backend.fly.dev
```

---

## 3. Vercel Frontend (5 min)

### Deploy via Dashboard
1. vercel.com → Add New Project → Import Git Repository
2. Root Directory: `frontend`
3. Framework: Vite (auto-detect)
4. Environment Variables:
   ```
   VITE_API_URL=https://educa-backend.fly.dev
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
   ```
5. Deploy → URL: `https://tu-app.vercel.app`

---

## 4. Conectar Todo

| Componente | Configuración |
|------------|---------------|
| **Supabase** | Auth → URL Configuration → Site URL: `https://tu-app.vercel.app` |
| **Supabase** | Auth → Redirect URLs: `https://tu-app.vercel.app/**` |
| **Fly.io** | `CORS_ORIGINS=https://tu-app.vercel.app` (ya en secrets) |
| **Vercel** | Environment Variables configuradas |

### Test
1. Abrir `https://tu-app.vercel.app`
2. Login: `admin@educa.com` / `admin123`
3. Verificar: Admin/Teacher/Student dashboards funcionan

---

## 5. Seed de Datos (si BD vacía)

```bash
flyctl ssh console -a educa-backend -C "python -m app.seed"
```

---

## 6. Comandos Útiles Fly.io

```bash
# Ver logs en vivo
flyctl logs -a educa-backend

# SSH a la VM
flyctl ssh console -a educa-backend

# Ejecutar migraciones manual
flyctl ssh console -a educa-backend -C "alembic upgrade head"

# Escalar a 0 (apagar) / 1 (encender)
flyctl scale count 0 -a educa-backend
flyctl scale count 1 -a educa-backend

# Ver métricas
flyctl dashboard -a educa-backend
```

---

## 7. Costos (Free Tier)

| Servicio | Límite | Costo |
|----------|--------|-------|
| Supabase | 500MB DB, 50K MAU | $0 |
| Fly.io | 3 VMs shared-cpu-1x | $0* |
| Vercel | 100GB bandwidth | $0 |

*Fly.io requiere tarjeta para verificación, no cobra en free tier.

---

## 8. Flujo de Autenticación

```
1. Usuario → Login en frontend (email/pass)
2. Frontend → Supabase Auth (signInWithPassword)
3. Supabase → Devuelve JWT (RS256) + session
4. Frontend listener onAuthStateChange → Detecta SIGNED_IN
5. Frontend → POST /auth/supabase-login { supabase_token }
6. Backend → Decodifica token (sin verify), busca/crea User local
7. Backend → Emite SU PROPIO JWT (HS256) + refresh token
8. Frontend → Guarda tokens propios, usa para llamadas API
```

---

## 9. Troubleshooting

| Problema | Solución |
|----------|----------|
| Backend no arranca | `flyctl logs -a educa-backend` → fix → `flyctl deploy` |
| Migración falla | `flyctl ssh console -C "alembic downgrade -1"` |
| Frontend 404 en refresh | Verificar `vercel.json` rewrites |
| CORS error | Verificar `CORS_ORIGINS` en Fly + redeploy |
| Auth loop | Verificar `VITE_API_URL` + Supabase redirect URLs |
| "relation users does not exist" | `flyctl ssh console -C "alembic upgrade head"` |
| Token expired 401 | Supabase refresca automáticamente; si falla, logout event |

---

## 10. Monitoreo

- **Uptime**: UptimeRobot (gratis) → `https://educa-backend.fly.dev/health`
- **Logs**: Fly.io dashboard / `flyctl logs`
- **DB Backups**: Supabase → Settings → Database → Backups (diarios gratis)
- **Métricas**: `flyctl dashboard -a educa-backend`

---

## Archivos de Configuración Clave

| Archivo | Propósito |
|---------|-----------|
| `backend/fly.toml` | Config Fly.io (región, VM, health checks) |
| `backend/Dockerfile` | Imagen Docker optimizada |
| `backend/app/core/database.py` | NullPool para PgBouncer |
| `backend/app/routers/auth.py` | Endpoint `/auth/supabase-login` |
| `frontend/vercel.json` | Config Vercel (rewrites, headers) |
| `frontend/src/lib/supabase.ts` | Cliente Supabase + helpers |
| `frontend/src/lib/api.ts` | Interceptor usa token Supabase |
| `frontend/src/auth/AuthContext.tsx` | Listener onAuthStateChange |