# Educa — Sistema de Control Académico y Aula Virtual

Plataforma full-stack para una academia de idiomas: gestión académica (usuarios,
idiomas, niveles, cursos, horarios, matrículas, asistencia y calificaciones) y un
**Lobby Virtual** para acceder a clases en vivo (Zoom / Meet / Teams).

**Stack:** FastAPI + SQLAlchemy + Alembic + PostgreSQL · React + Vite + TypeScript +
TailwindCSS + TanStack Query + React Router + React Hook Form + Zod.

Esta es la **Fase 1 (Fundación)**: núcleo académico completo, auth con roles y un
Lobby con prueba de cámara/micrófono. La integración de video usa el patrón *Strategy*
con un **proveedor manual** (el profesor pega la URL de la reunión); las APIs reales de
Zoom/Google quedan como esqueletos listos para implementar.

---

## Requisitos

- Docker (para PostgreSQL) · Python 3.11+ · Node 18+

---

## 1. Base de datos (PostgreSQL)

Ruta recomendada — con Docker:

```bash
docker compose up -d postgres
```

Esto levanta Postgres en `localhost:5432` (usuario `educa`, contraseña `educa`, base `educa`).

> **Alternativa sin Docker:** si no puedes usar Docker, instala Postgres localmente
> (p. ej. `conda create -n educa-pg -c conda-forge postgresql`, luego `initdb`,
> `pg_ctl start -o "-p 5432"`, y crea la base `educa`). Apunta `DATABASE_URL` a tu
> instancia local.

---

## 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configura variables de entorno
cp .env.example .env
# Genera una clave Fernet y pégala en FERNET_KEY del .env:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# (opcional) genera un JWT_SECRET largo:
python -c "import secrets; print(secrets.token_urlsafe(48))"
# (opcional) secreto para verificar webhooks de Zoom/Google:
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Crea las tablas y datos de ejemplo
alembic upgrade head
python -m app.seed

# Arranca la API
uvicorn app.main:app --reload
```

- API: <http://localhost:8000>
- Documentación interactiva (Swagger): <http://localhost:8000/docs>

> Con `ENVIRONMENT=production` la API **se niega a arrancar** si `JWT_SECRET` sigue
> siendo el placeholder de `.env.example`. En desarrollo sólo avisa por log.

> Las contraseñas se validan en la API (no sólo en el formulario): mínimo 8 caracteres y
> máximo 72 **bytes**, que es todo lo que bcrypt llega a leer. Más allá de ese límite bcrypt
> ignora el resto en silencio, con lo que dos contraseñas distintas con el mismo prefijo
> servirían para entrar; se rechazan en vez de aceptar una que no podemos comprobar entera.

### Usuarios de ejemplo (creados por el seed)

| Rol         | Correo             | Contraseña |
|-------------|--------------------|------------|
| Admin       | admin@educa.com    | admin123   |
| Profesor    | teacher@educa.com  | teacher123 |
| Alumno      | student@educa.com  | student123 |

### Tests

Las pruebas de API corren contra una base desechable (el esquema usa constraints de
exclusión GiST y ENUMs de Postgres, así que SQLite no sirve). Se crea una sola vez:

```bash
docker exec educa_postgres psql -U educa -d educa -c "CREATE DATABASE educa_test OWNER educa"
DATABASE_URL=postgresql+psycopg://educa:educa@localhost:5432/educa_test alembic upgrade head
```

Después, desde `backend/`:

```bash
pytest -q
```

Cada test corre dentro de una transacción que se revierte al terminar, así que la base
queda limpia y los tests no se ven entre sí.

---

## 3. Frontend (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm run dev
```

- App: <http://localhost:5173>

Inicia sesión con cualquiera de los usuarios de ejemplo; cada rol ve su propio panel:

- **Admin:** CRUD de usuarios, catálogo (idiomas/niveles), cursos, horarios y matrículas.
- **Profesor:** sus horarios, pasar lista, calificar y ver/iniciar clases virtuales.
- **Alumno:** cursos, calificaciones y **Lobby Virtual** (prueba de A/V, countdown y
  botón para entrar a la clase).

> El Lobby abre 15 min antes del inicio. El seed crea una reunión demo que empieza
> ~15 min después de sembrar, de modo que el alumno vea el Lobby disponible enseguida.

---

## Arquitectura

```
educa/
├── docker-compose.yml
├── backend/
│   ├── requirements.txt · alembic.ini · .env.example
│   ├── alembic/                 # migraciones
│   └── app/
│       ├── main.py              # FastAPI + CORS + routers
│       ├── core/                # config, database, security (JWT), deps (roles), crypto (Fernet)
│       ├── models/              # SQLAlchemy (11 tablas)
│       ├── schemas/             # Pydantic (validación E/S)
│       ├── routers/             # auth, users, catalog, schedules, enrollments,
│       │                        #   attendance, grades, meetings
│       ├── integrations/        # patrón Strategy de videoconferencia
│       │   ├── base_provider.py · manual_provider.py
│       │   ├── zoom_provider.py · google_provider.py   # esqueletos (TODO)
│       │   └── meeting_factory.py
│       ├── webhooks/            # receptor de eventos de proveedores (esqueleto)
│       └── seed.py
└── frontend/
    └── src/
        ├── lib/         # api (axios+JWT+403), queryClient, queries (TanStack), types, format
        ├── auth/        # AuthContext (hasRole), ProtectedRoute (por rol)
        ├── components/  # Layout, Tabs, Toaster, UI
        ├── features/    # schedules (planner), enrollments (wizard), grades (tabla + charts)
        └── pages/       # Login, Admin/Teacher/Student dashboards, Lobby
```

### Modelo académico (Fase 3): asignación, sesiones, ubicación y reportes

Cuatro piezas nuevas que giran en torno a la **sesión de clase**:

- **Asignación explícita profesor↔curso** (`course_teachers`): impartir un curso es ahora
  un vínculo propio, no algo deducido de los horarios. El admin asigna (validando la
  cualificación de idioma); un horario solo admite profesores ya asignados; y la
  autorización académica (`teacher_teaches_course`) lee esta tabla. Endpoints:
  `GET/POST/DELETE /catalog/courses/{id}/teachers`.
- **Sesión de clase** (`class_sessions`): una ocurrencia de un horario en una fecha
  (`generate` materializa el término; `ensure` crea la del día). Es el grano sobre el que
  cuelgan asistencia, notas y los reportes. `GET/POST /sessions`.
- **Asistencia y notas por sesión**: la asistencia se marca contra una sesión (una por
  alumno y sesión); las notas pueden ser **por sesión** (nota del día/participación) o
  **de curso** (`session_id` nulo → examen/final). Ambas por *upsert* idempotente.
- **Ubicación propuesta/aprobada** (`location_proposals`): el profesor propone dónde dará
  la clase — aula presencial, o enlace virtual (Meet/Zoom/Teams) — y el admin aprueba o
  rechaza; al aprobar se copia al horario (que guarda la ubicación *efectiva*: `modality`,
  `join_url`, `provider`). El enlace virtual es **uno fijo por horario**, reutilizado por
  cada sesión; el Lobby abre por sesión (`/lobby/{sessionId}`) y sigue ese enlace. Un admin
  que propone se autoaprueba. `POST /schedules/{id}/location/propose`,
  `POST /location-proposals/{id}/approve|reject`.
- **Reportes diario/semanal/mensual** (`GET /reports?period=day|week|month&anchor=`):
  agregación de solo lectura sobre las sesiones del rango (sesiones realizadas, % de
  asistencia por curso, promedio de notas del día, alumnos en riesgo), acotada por rol.
  `GET /reports/export` descarga el mismo reporte en CSV.

### Operación y confianza (roadmap F1–F4)

Cuatro capacidades que llevan el sistema de "núcleo académico" a "plataforma
operable". Detalle y secuencia en [`docs/roadmap.md`](docs/roadmap.md).

- **Auditoría** (`audit_log`): rastro append-only de quién cambió qué y de qué a
  qué, en notas, asistencia, matrículas, aprobaciones de ubicación y usuarios.
  Comparte transacción con el cambio (un cambio revertido no deja rastro) y
  **redacta** secretos. Solo admin: `GET /audit`.
- **Ciclo de vida de la sesión**: festivos (`academic_holidays`, la generación
  los salta) y **cancelar/reprogramar** una clase (`POST /sessions/{id}/cancel`
  · `/reschedule`, que crea una sesión de recuperación enlazada). Una clase
  cancelada no cuenta como realizada en los reportes.
- **Nota final y certificado de nivel**: pesos de evaluación por curso
  (`course_evaluations`), nota final ponderada contra `passing_score`, y
  **certificado PDF** verificable por código cuando el alumno aprueba
  (`GET /enrollments/{id}/final-grade`, `POST /enrollments/{id}/certificate`).
- **Notificaciones** in-app (`notifications`): campana con no-leídos; primer
  consumidor automático — cancelar/reprogramar una clase avisa a sus alumnos — y
  una alerta manual de alumnos en riesgo hacia sus profesores
  (`POST /notifications/alerts/at-risk`).

### Reglas de negocio (Fase 2)

- **Cruce de horarios del profesor**: `create/update` de horarios y el endpoint
  `POST /schedules/check-conflict` (usado por el calendario en vivo) bloquean solapes del
  mismo profesor en el mismo día. Lógica reutilizable en `app/services/scheduling.py`.
- **Cupos y choque del alumno**: al matricular (`POST /enrollments`) se bloquea la fila del
  curso (`with_for_update`) para no exceder `max_students`, y se detecta el choque de horario
  del alumno; un admin puede forzar con `?force=true`. El cupo tampoco puede **bajarse** por
  debajo de los alumnos activos que ya están dentro (409 `capacity_below_enrolled`).
- **Roles endurecidos**: profesores solo pueden calificar/pasar lista en cursos que **enseñan**
  (`teacher_teaches_course` en `core/deps.py`); las listas de notas/asistencia se filtran por rol.
- **Una fila por hecho**: un alumno tiene como mucho **una asistencia por día**
  (`uq_attendance_enrollment_date`) y **una nota por evaluación**
  (`uq_grade_enrollment_evaluation`). `POST /attendance` y `POST /grades` son *upserts*:
  volver a marcar o recalificar corrige la fila existente (200) en vez de añadir otra (201
  solo cuando es nueva). Sin esto, el profesor veía la primera nota y el alumno promediaba
  todas: dos cifras distintas para el mismo examen.
- **La carga semanal se cuenta por trimestre**: `max_weekly_hours` mide horas *en una semana
  dada*, así que un curso de primavera y otro de verano no se suman entre sí.
- **En un PATCH, `null` no es "déjalo como está"**: omitir un campo lo deja intacto; mandar
  `null` es pedir explícitamente vaciarlo. Los esquemas de PATCH heredan de `PatchModel`
  (`app/schemas/base.py`) y declaran qué campos respalda una columna NOT NULL, así que
  vaciar uno responde **422 nombrándolo** en vez de estrellarse contra la base. Los campos
  que sí son nulables (`end_date` = término abierto, `room_id` = sin aula,
  `max_weekly_hours` = sin tope) siguen aceptando `null`.

### Modelo de autorización

El rol por sí solo nunca basta para leer o escribir datos de otra persona: cada endpoint
comprueba además la **relación académica**.

| Recurso | Admin | Profesor | Alumno |
|---|---|---|---|
| `/meetings` | todas | las de **sus** horarios | las de sus cursos con matrícula **activa** |
| `host_url` (enlace de anfitrión) | sí | sí | **nunca** |
| `/enrollments` | todas | las de los cursos que imparte | sólo las suyas |
| `/schedules` | todo el horario | todo el horario (`?mine=true` lo acota) | sólo el de sus cursos activos |
| `/catalog/courses/{id}/students` | cualquiera | sólo sus cursos | 403 |
| `/users` (directorio con emails) | sí | 403 | 403 |

El horario completo es la única lectura que un profesor tiene sin acotar, y es deliberado:
es personal de la academia y necesita saber cuándo están ocupadas las aulas y sus colegas.
Un alumno no lo es, así que ve el horario de sus cursos y nada más — el resto sería un
padrón de quién enseña qué y a qué hora.

Dos detalles deliberados: un recurso que no puedes ver responde **404 y no 403**, para no
confirmar que existe; y el padrón (`UserBrief`) devuelve sólo `id` y `full_name`, porque un
profesor necesita poner un nombre junto a una nota, no leer el directorio de la academia.

### UX (Fase 2)

- **Planificador de horarios** (`features/schedules/SchedulePlanner.tsx`): calendario semanal
  `react-big-calendar` con drag-and-drop; al mover un bloque valida contra el backend y revierte
  si hay choque. Clic en un hueco → crear clase.
- **Wizard de matrícula** (`features/enrollments/EnrollWizard.tsx`): pasos curso→alumno→confirmar,
  con cupo en vivo y opción de forzar ante choque de horario.
- **Calificación** (`features/grades/`): tabla inline con autoguardado (profesor) y dashboard con
  barras de progreso + radar `recharts` (alumno).

### Integración de video (patrón Strategy)

`BaseMeetingProvider` define la interfaz; `meeting_factory.get_provider()` resuelve el
proveedor a partir de la fila `meeting_providers`. Hoy está activo `ManualProvider`
(persiste la URL que pega el profesor). Para habilitar Zoom/Google reales:

1. Crea la app/credenciales en el proveedor (Zoom S2S OAuth · Google Cloud + Calendar API).
2. Guarda las credenciales cifradas: `PUT /meetings/providers` con
   `{ "name": "zoom", "is_active": true, "credentials": { ... } }` (se cifran con Fernet).
3. Implementa los métodos en `zoom_provider.py` / `google_provider.py` (marcados con `# TODO`).
4. Los webhooks (`/webhooks/{provider}`) actualizan estado y `recording_url` al terminar la clase.

**Webhooks:** el receptor **falla cerrado**. Verifica la firma del proveedor (HMAC-SHA256
sobre el cuerpo crudo para Zoom, `x-goog-channel-token` para Google) contra `WEBHOOK_SECRET`,
y rechaza con 401 cualquier petición que no pueda verificar — incluido el caso de no tener
`WEBHOOK_SECRET` configurado. Registra ese mismo secreto en el panel del proveedor. El
proveedor `manual` no tiene webhook (404): la URL la pega el profesor a mano.

Una firma válida lo es para siempre, así que en Zoom (que firma el timestamp junto al cuerpo)
sólo se aceptan entregas de los **últimos 5 minutos**: un evento capturado y reenviado más
tarde se rechaza aunque su firma sea impecable.

---

## Fuera de alcance (fases futuras)

Integración real de Zoom/Google/Teams, módulo de Finanzas/facturación, chat en vivo por
WebSockets, pizarra colaborativa y grabaciones automáticas vía webhook real.
