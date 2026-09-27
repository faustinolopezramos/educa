# Especificación del Stack Tecnológico y Arquitectura de Producción • EDUCA

Documento técnico oficial que define los componentes, tecnologías, patrones de diseño y estándares de infraestructura que conforman la plataforma **EDUCA (SaaS Multi-Tenant de Gestión Académica y Aula Virtual)**.

---

## 1. Visión General de la Arquitectura

EDUCA opera bajo una arquitectura **B2B SaaS Multi-Tenant** moderna desacoplada en dos capas principales:
1. **Frontend SPA (Single Page Application):** Desarrollado con React 18 y TypeScript estricto, optimizado para un rendimiento sub-segundo en dispositivos de escritorio y móviles.
2. **Backend API RESTful:** Desarrollado con Python 3.10+ y FastAPI, respaldado por PostgreSQL y SQLAlchemy 2.0 con aislamiento riguroso a nivel de fila (*Row-Level Tenant Isolation*).

```
                      ┌────────────────────────────────────────┐
                      │          Usuarios / Clientes           │
                      │  (Directores, Profesores, Estudiantes) │
                      └───────────────────┬────────────────────┘
                                          │ HTTPS
                                          ▼
                      ┌────────────────────────────────────────┐
                      │          Edge CDN & Frontend           │
                      │  (React 18 + Vite + Tailwind + TanStack)│
                      └───────────────────┬────────────────────┘
                                          │ REST API / JWT
                                          ▼
                      ┌────────────────────────────────────────┐
                      │             FastAPI Backend            │
                      │  (Multi-tenant Guards, RBAC, Services) │
                      └───────┬───────────┬────────────┬───────┘
                              │           │            │
             PostgreSQL 16    │           │ SMTP / API │ WhatsApp Cloud API
                              ▼           ▼            ▼
                      ┌──────────────┐ ┌────────┐ ┌───────────────┐
                      │  PostgreSQL  │ │ Correo │ │ Meta Business │
                      │ Multi-tenant │ │ Trans. │ │  (Templates)  │
                      └──────────────┘ └────────┘ └───────────────┘
```

---

## 2. Frontend (Cliente Web)

| Componente | Tecnología | Versión | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Framework Base** | **React** | `18.3.x` | Renderizado eficiente mediante Concurrent Mode, ecosistema maduro y adopción masiva en la industria. |
| **Lenguaje** | **TypeScript** | `5.5.x` (Strict) | Tipado estático de punta a punta, eliminación de errores `null/undefined` en tiempo de desarrollo. |
| **Herramienta de Build** | **Vite** | `6.x` | Hot Module Replacement (HMR) instantáneo en desarrollo y empaquetado optimizado con Rollup en producción. |
| **Gestión de Estado Servidor** | **TanStack React Query** | `v5` | Manejo automático de caché, revalidación en segundo plano, mutaciones optimistas y garbage collection. |
| **Enrutamiento** | **React Router DOM** | `v6.x` | Enrutamiento declarativo del lado del cliente con guardias de rol (`ProtectedRoute`) y subdominios. |
| **Diseño y Estilos** | **Tailwind CSS** | `3.4.x` | Utility-first CSS con paleta minimalista cálida (`#FDFBF7`, `brand-600`, `slate-900`) sin sobrecarga de CSS runtime. |
| **Formularios y Esquemas** | **React Hook Form + Zod** | `7.x` / `3.x` | Formularios no controlados de alto rendimiento con validación declarativa e inferencia de tipos TypeScript. |
| **Librería de Componentes** | **Custom Design System** | Propio | Componentes sin dependencias pesadas: `Button`, `Card`, `Modal`, `Drawer`, `Badge`, `Input`, `Select`, `SegmentedControl`. |
| **Calendario Académico** | **React Big Calendar** | `1.19.x` | Vista semanal, mensual y diaria de horarios con soporte de arrastrar y soltar (drag & drop). |
| **Pruebas Automatizadas** | **Vitest + RTL** | `v1.6` | Suite de pruebas unitarias y de integración ultra rápida con compatibilidad nativa con Vite. |

---

## 3. Backend (API y Servicios de Negocio)

| Componente | Tecnología | Versión | Justificación Técnica |
| :--- | :--- | :--- | :--- |
| **Lenguaje** | **Python** | `3.10+` | Balance óptimo entre velocidad de desarrollo, tipado moderno (`typing`, `Union`, `Literal`) y librerías robustas. |
| **Framework Web** | **FastAPI** | `0.111.x` | Rendimiento asíncrono con ASGI (Starlette), validación automática y documentación OpenAPI/Swagger automática. |
| **Servidor ASGI** | **Uvicorn / Gunicorn** | `0.30.x` | Servidor ASGI de alto rendimiento basado en `uvloop` y `httptools`. |
| **Validación de Datos** | **Pydantic** | `v2.x` | Parseo, validación y serialización de esquemas REST de altísima velocidad basada en Rust. |
| **ORM / Acceso a Datos** | **SQLAlchemy** | `2.0.x` | Estilo declarativo moderno (`Mapped`, `mapped_column`, `select(...)`), soporte para transacciones ACID y pool de conexiones. |
| **Migraciones de BD** | **Alembic** | `1.13.x` | Control de versiones inmutable del esquema de base de datos con migraciones reversibles. |
| **Driver de Base de Datos** | **Psycopg 3** | `3.1.x` | El driver PostgreSQL oficial más moderno, con soporte asíncrono nativo y pools de conexión eficientes. |
| **Base de Datos Relacional** | **PostgreSQL** | `15 / 16` | Integridad referencial fuerte, soporte JSONB para snapshots de auditoría y rendimiento comprobado en producción. |
| **Cifrado de Secretos** | **Cryptography (Fernet)** | `42.x` | Cifrado simétrico AES-128-CBC en reposo para tokens de videollamada y credenciales de proveedores. |

---

## 4. Seguridad y Control de Acceso

1. **Aislamiento Multi-Tenant:**
   * Cada registro en las tablas operativas incluye `tenant_id`.
   * El middleware y los inyectores de dependencia (`Depends(_resolve_tenant_id)`) obligan a que todas las consultas SQL filtren por la academia del usuario autenticado.
   * Un usuario de una academia jamás puede ver, editar o eliminar registros de otra institución.
2. **Tokens y Autenticación:**
   * **Access Token:** JWT firmado con algoritmo `HS256`, con tiempo de vida corto (30 minutos en producción).
   * **Refresh Token Rotation:** Almacenado de forma segura, se rota con cada uso. Presentar un token ya rotado revoca todas las sesiones del usuario (detección activa de robo).
   * **Web Locks API:** Mutex nativo en el frontend para evitar condiciones de carrera entre múltiples pestañas al refrescar tokens.
3. **Control de Acceso Basado en Roles (RBAC):**
   * `superadmin`: Administrador global de la plataforma (gestión de tenants, planes y nacionalidades).
   * `admin`: Director de la academia con acceso total al catálogo, profesores, horarios y finanzas.
   * `assistant`: Personal administrativo con permisos granulares (cobros, admisiones, profesores).
   * `teacher`: Profesores (acceso a sus clases, alumnos,SpeedGrader y pase de lista).
   * `student`: Alumnos (acceso a sus asignaciones, notas, recibos de entrega y lobby de clases).
4. **Protección contra Abusos (Rate Limiting):**
   * Límite de intentos de login y registro por dirección IP para mitigar ataques de fuerza bruta.

---

## 5. Canales de Notificación e Integraciones

1. **WhatsApp Cloud API (Meta Graph API v23.0):**
   * **Modo A (Pasarela Oficial EDUCA):** Modelo gestionado "Zero-Config" donde las academias envían notificaciones a través de la infraestructura verificada de EDUCA usando plantillas pre-aprobadas por Meta.
   * **Modo B (Cuenta Propia):** Permite a academias consolidadas conectar su propio `Phone Number ID` y `System User Token`.
2. **Web Push Notifications:**
   * Estándar VAPID con Push API del navegador para avisos en tiempo real cuando el alumno o profesor está en su computadora o móvil.
3. **Correo Transaccional (SMTP):**
   * Compatible con cualquier proveedor SMTP estándar (Resend, Brevo, SendGrid, Amazon SES o Google Workspace) mediante STARTTLS o SSL directo (puerto 465/587).
4. **Videoconferencias (Aula Virtual):**
   * Integración con Google Meet, Zoom y Jitsi Meet mediante URLs directas generadas y verificadas por la academia.

---

## 6. Planes de Suscripción y Límites

| Plan | Límite de Alumnos | Costo Mensual | Enfoque de Mercado |
| :--- | :--- | :--- | :--- |
| **Gratis (Semilla)** | **Hasta 15 alumnos** | **$0 / mes para siempre** | Tutores particulares, profesores independientes y academias que están empezando. |
| **Starter** | Hasta 100 alumnos | $49 / mes | Academias en crecimiento que necesitan erradicar el desorden de WhatsApp. |
| **Profesional** | Hasta 300 alumnos | $129 / mes | Institutos consolidados con múltiples profesores, nómina y alertas tempranas. |
| **Escala** | Hasta 1,000 alumnos | $279 / mes | Franquicias, redes de colegios o centros de formación técnica masiva. |

---

## 7. Despliegue en Producción Recomendado

* **Frontend:** Vercel / Cloudflare Pages / Netlify (Deploy continuo desde Git, distribución global en CDN Edge, compresión Brotli/Gzip automática).
* **Backend:** Fly.io / Render / Railway / AWS ECS (Contenedor Docker basado en `python:3.10-slim`, balanceo de carga, auto-escalado).
* **Base de Datos:** Supabase PostgreSQL / Neon Serverless / AWS RDS (PostgreSQL 16 administrado, backups diarios automatizados, réplicas de lectura opcionales).
* **Almacenamiento de Tareas y Archivos:** Supabase Storage / AWS S3 / Cloudflare R2 con políticas de acceso y URLs prefirmadas.
