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
- Authentication → Providers → Email → **Confirm email ACTIVADO**
  (el backend sólo enlaza una cuenta de Supabase con una de Educa si el correo
  está confirmado; sin eso, registrarse con el correo de otra persona bastaría
  para entrar como ella)
- Authentication → Providers → Email → **desactiva el registro público** si las
  cuentas las da de alta la academia: `/auth/supabase-login` nunca crea usuarios,
  así que un registro sin cuenta local no sirve de nada.
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
  SUPABASE_URL="https://xxxxx.supabase.co" \
  SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIs..." \
  TRUST_PROXY_HEADERS="true" \
  ACADEMY_TIMEZONE="America/Guatemala"
```

> `DATABASE_URL` no necesita `sslmode`: en producción el backend se lo añade solo.
> `SUPABASE_ANON_KEY` es la clave pública (anon), **nunca** la `service_role`.
> Para permitir las vistas previas de Vercel, añade `CORS_ORIGIN_REGEX` con el
> patrón de tu proyecto (p. ej. `https://educa-[a-z0-9-]+\.vercel\.app`). Sin él
> sólo entran los orígenes listados en `CORS_ORIGINS`.

### Migraciones
`fly.toml` las ejecuta en el `release_command`, una sola vez por despliegue y
antes de que la versión nueva reciba tráfico. Si fallan, el despliegue se
detiene y sigue sirviendo la anterior.

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
2. Entrar con la cuenta de administrador
   (**cambia la contraseña del seed antes de exponer la aplicación**: `admin123`
   está publicada en este repositorio)
3. Verificar: Admin/Teacher/Student dashboards funcionan

---

## 4.1 Tareas programadas

`expire-makeups` marca como vencidos los pases de recuperación cuya fecha pasó.
Los endpoints ya caducan cada pase al leerlo, así que esto sólo evita que los
recuentos dependan de que alguien abra la pantalla. Con una máquina programada
de Fly (diaria) o a mano:

```bash
flyctl ssh console -a educa-backend -C "python -m app.cli expire-makeups"
```

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

Educa emite siempre su propia sesión. Supabase, cuando está configurado, es sólo
una forma más de demostrar quién eres.

```
1. Usuario → Login en frontend (email/pass)
2. Frontend → POST /auth/login (credenciales propias de Educa)
   └─ 200: listo, tokens propios
   └─ 401 y Supabase configurado ↓
3. Frontend → Supabase Auth (signInWithPassword) → access token de Supabase
4. Frontend → POST /auth/supabase-login { supabase_token }
5. Backend → GET /auth/v1/user de Supabase para VALIDAR el token
              (firma, vigencia, revocación y correo confirmado)
6. Backend → Enlaza con un usuario local existente y activo
              (por supabase_uid, o por correo la primera vez).
              NO crea cuentas: el alta la hace la academia.
7. Backend → Emite SU PROPIO JWT (HS256) + refresh token rotativo
8. Frontend → Guarda sólo los tokens de Educa y los usa en toda la API.
              Renueva con /auth/refresh (rotación con detección de reutilización).
```

La sesión de Supabase no se persiste en el navegador: se usa para el canje y se
descarta. Si `SUPABASE_URL`/`SUPABASE_ANON_KEY` no están configurados, el paso 3
no existe y `/auth/supabase-login` responde 503.

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
| `backend/app/core/database.py` | Pool y `prepare_threshold` para PgBouncer |
| `backend/app/models/teacher_rate.py` | Historial de tarifas docentes por fecha |
| `backend/app/routers/auth.py` | Endpoint `/auth/supabase-login` |
| `frontend/vercel.json` | Config Vercel (rewrites, headers) |
| `backend/app/services/supabase_auth.py` | Valida el token contra Supabase |
| `frontend/src/lib/supabase.ts` | Cliente Supabase (sesión no persistida) |
| `frontend/src/lib/api.ts` | Interceptor + renovación de la sesión de Educa |
| `frontend/src/auth/AuthContext.tsx` | Login propio con respaldo Supabase |