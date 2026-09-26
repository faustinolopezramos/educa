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

### Barrido semanal de alumnos en riesgo

No hace falta programarlo: la API lo lanza sola los lunes desde las 7:00 (hora
de la academia), una vez por semana y academia (`AT_RISK_SWEEP_WEEKDAY`,
`AT_RISK_SWEEP_HOUR`, `AT_RISK_SWEEP_ENABLED`). Para adelantarlo:

```bash
flyctl ssh console -a educa-backend -C "python -m app.cli at-risk-sweep --force"
```

---

## 4.2 Avisos por correo y WhatsApp

Cada notificación (clase cancelada, clase reprogramada, alumnos en riesgo) se
guarda en la campana y, además, se pone en una cola de envío por cada canal
configurado. La API vacía esa cola cada 20 s (`BACKGROUND_JOBS_INTERVAL_SECONDS`) desde su propio proceso: no hace
falta un worker aparte. Un envío que falla se reintenta 4 veces más (hasta ~1 h);
lo que lleva más de 12 h en cola se descarta, porque avisar de una clase
cancelada al día siguiente no sirve de nada.

Estado de la cola y últimos errores:

```bash
flyctl ssh console -a educa-backend -C "python -m app.cli dispatch-notifications"
```

### Correo

Cualquier proveedor SMTP. El remitente visible es el nombre de la academia.

```bash
flyctl secrets set SMTP_HOST=smtp.resend.com SMTP_PORT=465 \
  SMTP_USER=resend SMTP_PASSWORD="re_..." \
  EMAIL_FROM=avisos@tu-dominio.com APP_URL=https://tu-app.vercel.app
```

Configura SPF y DKIM del dominio de `EMAIL_FROM` en el proveedor; sin eso los
avisos acaban en spam.

### WhatsApp (Cloud API de Meta)

1. En Meta Business Manager, crea una app de tipo *Business* con el producto
   WhatsApp y registra el número de la academia.
2. Crea un **usuario del sistema** con permiso `whatsapp_business_messaging` y
   genera un token permanente (el temporal de la consola caduca en 24 h).
3. Registra estas plantillas, categoría **Utilidad**, idioma **Spanish (es)**.
   El nombre y el número de variables tienen que coincidir exactamente:

   **`educa_clase_cancelada`**
   > Hola {{1}}, tu clase de {{2}} del {{3}} fue cancelada. Revisa la aplicación de la academia para más detalles.

   **`educa_clase_reprogramada`**
   > Hola {{1}}, tu clase de {{2}} del {{3}} se movió al {{4}}. Revisa la aplicación de la academia para más detalles.

   ({{1}} nombre, {{2}} curso, {{3}} "lunes 15 de septiembre a las 18:00",
   {{4}} "miércoles 17 de septiembre".)
4. Cuando Meta las apruebe:

```bash
flyctl secrets set WHATSAPP_TOKEN="EAAG..." WHATSAPP_PHONE_NUMBER_ID="1234567890"
```

**Consentimiento.** Meta exige que la persona haya aceptado recibir mensajes.
Por eso WhatsApp viene apagado para todos: lo activa cada alumno en su perfil, o
administración al editar al usuario (casilla "Aceptó recibir avisos por
WhatsApp") si el consentimiento se recogió en la matrícula. Los teléfonos sin
código de país se envían con `WHATSAPP_DEFAULT_COUNTRY_CODE`; un número
extranjero hay que guardarlo con su `+`.

---

## 4.3 App instalable y avisos push

El frontend es instalable (manifest + service worker en `frontend/public/`): en
Android/Chrome el perfil ofrece "Instalar la app"; en iPhone explica el paso por
Safari (Compartir → Añadir a pantalla de inicio). **En iPhone los avisos push
sólo funcionan dentro de la app instalada** (iOS 16.4 o posterior).

Para activar los avisos push, genera las claves **una sola vez** y guárdalas:

```bash
cd backend && python -m app.cli generate-vapid-keys
flyctl secrets set VAPID_PUBLIC_KEY="B..." VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:soporte@tu-dominio.com"
```

No las cambies después: cada dispositivo suscrito tendría que volver a activar
los avisos. Cada persona los activa por dispositivo en su perfil ("Avisos en
este dispositivo"); el permiso que pide el navegador es el consentimiento. Los
avisos push salen por la misma cola que el correo y WhatsApp, con sus reintentos
y su caducidad a las 12 h. Un dispositivo que el servicio de push da por
desaparecido (404/410) se borra solo.

`sw.js` y `manifest.webmanifest` se sirven con `Cache-Control: no-cache`
(`vercel.json` y `nginx.conf`) para que un despliegue los renueve.

---

## 5. Instalación inicial (BD vacía)

Una instalación nueva sólo necesita las nacionalidades y el superadmin, con una
contraseña que elijas tú:

```bash
flyctl ssh console -a educa-backend
# dentro de la VM (la contraseña se pide sin eco):
python -m app.cli bootstrap --email tu-correo@dominio.com
```

Después entra como superadmin, abre **Academias → Nueva academia** y crea la
academia con su primer administrador.

> **No uses `python -m app.seed` en producción.** Crea una «Academia Demo» con
> contraseñas publicadas en el código (`superadmin123`, `teacher123`…) y se niega
> a ejecutarse con `ENVIRONMENT=production`.

**Si esta instalación se preparó con el seed**, el superadmin `superadmin@educa.com`
tiene la contraseña `superadmin123`. Cámbiala ya (también cierra sus sesiones):

```bash
python -m app.cli bootstrap --email superadmin@educa.com --reset-password
```

y da de baja o cambia las cuentas demo (`admin@educa.com`, `teacher@educa.com`,
`student@educa.com`…) si siguen activas.

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