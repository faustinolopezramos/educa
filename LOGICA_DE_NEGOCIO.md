# Educa — Lógica de Negocio

## Sistema de Control Académico y Aula Virtual

> **Nota de esta revisión**: este documento fue verificado línea por línea contra el código del backend y frontend (no solo contra la intención de diseño). Donde el comportamiento real difiere de lo esperado, se marca explícitamente. La sección 17 resume los hallazgos que conviene que negocio revise antes de presentar el sistema como terminado.
>
> **Actualización más reciente**: se incorporaron los requerimientos de stakeholders (datos de contacto y nacionalidad de alumnos/profesores, catálogo académico generalizado a Competencias Digitales/Negocios, matrícula con código correlativo y cuota, un módulo de Finanzas con cargos/pagos/facturas, jornadas predefinidas de horario, y la modalidad "Semi presencial"). También se cerró la brecha de revocación de sesión al cambiar contraseña, señalada como hallazgo de alto impacto en la revisión anterior. Los puntos nuevos que todavía dependen de una decisión de negocio están marcados igual que el resto, con ⚠️.

---

## 1. Propósito del Sistema

Educa es una plataforma integral para la gestión de una academia que ofrece **idiomas y programas de competencias digitales y de negocios**. Su objetivo es centralizar en un solo lugar:

- La **gestión académica** (alumnos, profesores, cursos, horarios, matrículas)
- El **control de clases** (asistencia, calificaciones, certificados)
- El **aula virtual** (lobby para clases en vivo con Zoom/Meet/Teams)

---

## 2. Roles de Usuario

| Rol | Descripción | Lo que puede hacer |
|-----|-------------|-------------------|
| **Admin** | Dirección/administración de la academia | CRUD completo de usuarios, catálogo, horarios, matrículas; acceso a reportes globales y auditoría |
| **Teacher** | Profesor (idiomas o competencias) | Ver sus horarios, pasar lista, calificar, proponer ubicación de clase, acceder al lobby |
| **Student** | Alumno | Ver sus cursos, calificaciones, asistencia; acceder al lobby virtual; descargar certificados |

### Datos de contacto y nacionalidad

Todo usuario (admin, profesor o alumno es, técnicamente, la misma tabla con un rol distinto) puede tener registrado: **teléfono**, **dirección** y **nacionalidad**. Los tres campos son opcionales — un usuario puede quedar sin ninguno de los tres sin que nada se lo impida.

- La **nacionalidad** se elige de un catálogo (`Nacionalidades`) administrado como una lista simple, igual que el catálogo de idiomas: el admin agrega/edita/borra países libremente desde el panel de catálogo. El sistema no agrupa por región (Centroamérica, Sudamérica, etc.) — es una lista plana.
- Cada usuario edita su propio teléfono, dirección y nacionalidad desde su perfil; un admin puede además editarlos para cualquier usuario desde la gestión de usuarios.
- **⚠️ Semilla de datos pendiente de confirmar**: la lista de nacionalidades cargada de ejemplo (Colombia, Venezuela, Cuba, Brasil, Argentina, Uruguay, Chile, Egipto, Siria, Líbano, China, Taiwán) viene tal cual del requerimiento original de negocio, que las agrupaba bajo "Centroamérica" — ninguno de esos países es en realidad centroamericano. Falta que negocio confirme la lista real de países a ofrecer (¿falta Guatemala y el resto de Centroamérica?).

---

## 3. Catálogo Académico

### Jerarquía
```
Idioma / Track (Inglés, Español, Computación básica, Marketing Digital...)
  └── Nivel / Módulo (A1, A2, B1, B2, C1, C2  ó  Módulo 1..4)
       └── Curso (Inglés Básico A1 - 2026Q1)
```

**Reglas:**
- Un idioma tiene múltiples niveles
- Un nivel pertenece a un solo idioma
- Un curso pertenece a un nivel y tiene fechas de inicio/fin, cupo máximo y nota de aprobación
- Editar las fechas de un curso propaga el cambio de término a sus horarios, lo que puede generar un conflicto (409) si el nuevo rango choca con otra clase del profesor o del aula

### Áreas académicas (Idiomas / Competencias Digitales / Competencias de Negocios)

La oferta académica ya no es solo idiomas. Cada "idioma" del catálogo lleva ahora una etiqueta de **área** (`kind`): **Idiomas**, **Competencias Digitales** o **Competencias de Negocios**. La jerarquía Idioma→Nivel→Curso es la misma para las tres áreas — no hay tablas ni pantallas separadas:
- **Idiomas**: Inglés, Español — el "nivel" es la etapa CEFR (A1..C2, incluido el "B1+" no estándar que ya usaba la academia)
- **Competencias Digitales**: Computación básica para adultos, Marketing Digital — el "nivel" pasa a ser el **módulo** (Módulo 1 a 4)
- **Competencias de Negocios**: Inteligencia Emocional, Emprendimiento — misma lógica de módulos

El Catálogo Académico (pantalla de administración) agrupa la lista de idiomas/tracks por esta etiqueta de área para mostrar las tres secciones que pide el negocio, pero por debajo sigue siendo el mismo catálogo genérico de siempre.

**⚠️ Sin auditoría**: a diferencia de matrículas y calificaciones, los cambios al catálogo (crear/editar/borrar idioma, nivel, curso, asignación de profesor, nacionalidad) **no quedan registrados en la auditoría**.

**⚠️ Borrado en cascada**: eliminar un idioma o un nivel borra en cascada sus cursos, y con ellos matrículas, notas y certificados asociados, sin ningún aviso o confirmación adicional a nivel de negocio.

---

## 4. Profesores

### Asignación a cursos
Un profesor debe ser **asignado explícitamente** a un curso (tabla de asignaciones profesor–curso) para poder impartirlo. La asignación **rechaza de forma dura (409, no overridable)** si el profesor no está cualificado en el idioma del curso.

No se puede desasignar a un profesor de un curso mientras tenga horarios activos en él (evita horarios huérfanos).

### Cualificación
- Se configura qué idiomas puede enseñar cada profesor
- Un profesor sin cualificaciones configuradas = puede enseñar cualquier idioma (postura "optimista" por defecto)
- Una vez que se le asigna al menos un idioma, solo puede enseñar esos
- **Dos niveles de rigor distintos**: al asignar el profesor a un curso, la cualificación es un bloqueo duro; al crear/editar un horario individual, la falta de cualificación es solo una advertencia overridable con `?force=true`. Conviene que negocio confirme si esta diferencia es intencional.

### Disponibilidad
- Los profesores definen sus ventanas de disponibilidad semanales
- Si no define disponibilidad, se asume que está disponible siempre
- El sistema alerta (pero no bloquea) si se le asigna una clase fuera de su disponibilidad
- Si a un profesor se le quitan idiomas o disponibilidad **después** de tener horarios ya creados, esos horarios no se revalidan automáticamente

### Límite de carga semanal
- Se puede configurar un tope de horas semanales por profesor
- El cómputo es **por semana**, no global (cursos en trimestres que no se solapan no se acumulan)

---

## 5. Horarios y Sesiones

### Estructura
- **Horario**: franja semanal recurrente (ej. "Lunes 10:00-12:00") con fechas de vigencia
- **Sesión**: ocurrencia concreta de un horario en una fecha específica (ej. "Lunes 15 de enero")

### Jornadas y Planes (Nocturna, Sabatino, Dominical)

Al crear los horarios de un curso, quien arma el horario puede elegir una **jornada predefinida** en vez de escoger día y hora a mano:

| Jornada | Días | Franja |
|---|---|---|
| Nocturna | Lunes y Miércoles **o** Martes y Jueves | 18:00–20:00 |
| Plan Sabatino | Sábado | Matutina (08:00–12:00) o Vespertina (14:00–18:00) |
| Plan Dominical | Domingo | Matutina (08:00–12:00) o Vespertina (14:00–18:00) |

Elegir "Nocturna" crea automáticamente **dos** horarios (uno por cada día de esa jornada); las demás crean uno solo. No es un concepto nuevo en la base de datos: son combinaciones ya validadas de día+hora sobre el mismo horario semanal de siempre, así que siguen protegidas por las mismas reglas de choque de profesor/aula de esta sección. Quien arma el horario también puede seguir eligiendo un día y hora libremente, sin usar ninguna jornada predefinida.

**⚠️ Horarios de las franjas pendientes de confirmar**: los rangos de "Matutina"/"Vespertina" de arriba son un valor por defecto razonable, no un dato que haya dado el negocio explícitamente. Conviene confirmarlos antes de anunciar estas jornadas a los alumnos.

### Reglas de negocio

**Cruces de horario (protegidos en dos capas):**
- Un profesor no puede tener dos clases en el mismo día y horario
- Un aula no puede tener dos clases en el mismo día y horario (esta protección solo aplica si el aula está asignada; una clase virtual sin aula no participa de esta validación)
- Un alumno no puede quedar matriculado en dos cursos cuyo horario choque (ver sección 6)
- Se verifica tanto en la API como con una restricción de exclusión (`EXCLUDE`) en PostgreSQL sobre día, rango horario y vigencia

**Bloqueos suaves (override con `?force=true`, solo al crear/editar un horario):**
- Profesor no cualificado para el idioma
- Clase fuera de la disponibilidad del profesor
- Excede el límite de horas semanales

**Generación de sesiones:**
- **No es automática.** Requiere que un admin o profesor invoque explícitamente la generación masiva para el término (no hay un job que la dispare al crear el horario)
- Se saltan los días festivos configurados
- Se puede asegurar una sesión para un día específico

**Cancelación y reprogramación:**
- Una sesión puede cancelarse (con motivo opcional); la fila se conserva con estado "cancelada"
- Puede reprogramarse a otra fecha (crea una sesión de recuperación vinculada a la original)
- Al cancelar/reprogramar, se genera una **notificación interna del sistema** (campana in-app) a los alumnos con matrícula activa — **no** se envía correo ni SMS
- **⚠️ La reprogramación no revalida choques reales de horario**: solo verifica que la nueva fecha no sea festivo y que no exista ya otra sesión de ese mismo horario ese día. No comprueba si el profesor o el aula ya tienen otra clase (de otro horario distinto) en esa fecha/hora — a diferencia de la creación de un horario nuevo, que sí está protegida por la restricción de base de datos. Es posible generar una doble reserva silenciosa al reprogramar
- **⚠️ Ni cancelar ni reprogramar quedan en la auditoría** — solo generan la notificación al alumno; no hay traza de quién canceló o reprogramó una clase y cuándo

---

## 6. Matrículas

### Proceso
1. El admin selecciona un curso y un alumno
2. El sistema verifica:
   - Que el alumno existe y tiene rol de estudiante
   - Que no está ya matriculado en ese curso
   - Que el curso tiene cupo disponible
   - Que el horario del curso **no choca** con otros cursos del alumno

### Reglas
- El cupo se protege con bloqueo de fila (`SELECT ... FOR UPDATE`) para evitar sobre-subscripción
- Si hay choque de horario, el admin puede forzar la matrícula con `?force=true`
- No se puede reducir el cupo máximo por debajo de los alumnos ya matriculados
- El pago puede estar: pendiente, pagado o **vencido** — solo el estado *vencido* bloquea el acceso a notas y reportes; *pendiente* no bloquea nada

### Código de matrícula y estado

Cada matrícula recibe, al crearse, un **código correlativo** propio (ej. `2026-00001`) — es el "Código/Carné" que pide el negocio para identificar la inscripción, generado automáticamente y sin que dos matrículas puedan compartirlo.

El estado de la matrícula ahora tiene **cinco** valores (antes eran tres: activa/completada/cancelada). Esta es también, deliberadamente, la única noción de "estatus del alumno" en el sistema: no existe un estatus separado a nivel de persona, porque el ciclo de vida académico de un alumno se expresa siempre a través de sus matrículas.

| Estado | Significado |
|---|---|
| **Inscrito** | Recién matriculado, aún no arrancó o no se activó formalmente |
| **Activo** | Cursando — el único estado que habilita pasar lista y contar cupo |
| **Inactivo** | En pausa (sin ser baja definitiva) |
| **Certificado** | Terminó y aprobó el curso (equivalente a "Graduado") |
| **Desistió** | Dio de baja el curso (antes "cancelada") |

### Bloqueos
- **`attendance_blocked`**: bloqueo disciplinario. En la práctica solo impide abrir el **detalle** de una sesión puntual (donde está el enlace de la clase); el alumno sigue viendo el listado/calendario general de sesiones
- **Solvencia**: si el pago está vencido, el alumno no puede ver notas ni reportes

### Finanzas de la matrícula (cuota, cargos, pagos y facturas)

Cada matrícula puede llevar una **cuota** (el monto acordado). A partir de esa cuota se lleva un **libro de movimientos** (ledger) por matrícula, con dos tipos de entrada:
- **Cobro** (cargo): dinero que se le debe a la academia. Se crea uno automático por el monto de la cuota al matricular (si la cuota es 0, no se crea ningún cargo).
- **Pago**: dinero efectivamente recibido (efectivo, tarjeta, transferencia u otro método).

El **saldo** de una matrícula (`cargado − pagado`) siempre se calcula al vuelo a partir de esos movimientos — nunca se guarda como un número aparte, así que no puede quedar desincronizado.

Sobre ese ledger, un admin puede emitir una **factura** (comprobante interno, no una factura fiscal/electrónica): un recibo numerado con código correlativo propio y PDF descargable, por el total pagado hasta ese momento. Solo se puede emitir si hay al menos un pago registrado.

**⚠️ Puntos pendientes de confirmar:**
- Los **métodos de pago** ofrecidos hoy (efectivo, tarjeta, transferencia, otro) son un punto de partida razonable, no una lista confirmada por negocio.
- El comprobante que se emite es un **recibo interno**, sin integración con ningún esquema de facturación electrónica/fiscal. Si la operación real de la academia requiere facturación con validez fiscal (por ejemplo, DTE), es un desarrollo aparte, no cubierto todavía.
- El formato del correlativo (matrícula: `AAAA-00001`; factura: `FAC-AAAA-00001`) es una convención elegida por el equipo, no un formato pedido explícitamente por negocio.

### ⚠️ Riesgos detectados
- **No se puede re-matricular a un alumno en un curso del que desistió previamente.** La restricción de unicidad (alumno, curso) es a nivel de tabla y no distingue por estado; una vez que una matrícula queda en "Desistió", un segundo intento de matricular al mismo alumno en el mismo curso choca con esa restricción. Probablemente no es el comportamiento deseado por negocio.
- **Reactivar una matrícula (pasar su estado de vuelta a "Activo") no revalida cupo ni choques de horario** — esa validación solo ocurre al crear la matrícula por primera vez. Es posible sobre-poblar un curso reactivando matrículas.

---

## 7. Asistencia

### Marcación
El profesor marca asistencia para cada matrícula en cada sesión:

| Estado | Significado |
|--------|-------------|
| **Presente** | Asistió |
| **Tarde** | Llegó tarde |
| **Ausente** | No asistió |
| **Justificado** | Falta justificada |

### Reglas
- **Upsert idempotente y atómico**: volver a marcar reemplaza la marca anterior (no acumula), protegido contra condiciones de carrera por una restricción única en base de datos
- Una matrícula solo puede tener **una** marca de asistencia por sesión
- Todos los cambios quedan registrados en la **auditoría**

### ⚠️ Validaciones ausentes
- Se puede registrar asistencia sobre una matrícula ya "Desistió"/"Certificado" — no hay chequeo de estado de la matrícula
- Se puede registrar asistencia sobre una sesión ya cancelada — no hay chequeo de estado de la sesión

---

## 8. Calificaciones

### Dos tipos de nota
1. **Nota del día**: calificación por sesión (participación diaria)
2. **Evaluaciones de curso**: exámenes, trabajos, nota final — sin sesión asociada

### Reglas
- Escala: **0.0 a 10.0**
- **Upsert idempotente**: recalificar reemplaza, no acumula
- Las notas se guardan automáticamente al salir del campo (autosave)
- Todas las modificaciones quedan en auditoría

### Nota final
- Se calcula como **promedio ponderado** usando los pesos configurados por evaluación
- Si no hay pesos configurados, todas las evaluaciones pesan 1.0
- El alumno **aprueba** si su nota final ≥ `passing_score` del curso

> **Ver sección 12**: el "promedio de notas" que muestran los **reportes** es distinto de esta nota final — solo considera notas de sesión, no evaluaciones/exámenes.

---

## 9. Certificados

### Emisión
- Solo se emite si el alumno **aprueba** el curso
- **Un solo certificado por matrícula** (no se puede emitir duplicado)
- El certificado incluye un **código único verificable** con prefijo `EDUCA-`
- Se puede descargar en **PDF**
- El certificado guarda una "fotografía" de la nota final y el nivel al momento de emitirse — si luego se recalifica al alumno o cambia el curso, el certificado ya emitido no se actualiza
- **La verificación por código requiere iniciar sesión en el sistema** — no es un endpoint público abierto a cualquier persona externa a la academia, como podría entenderse de "cualquiera puede verificar"

---

## 10. Ubicación de Clases (Propuesta/Aprobación)

### Flujo
1. El **profesor** propone dónde dará la clase, en una de tres modalidades:
   - **Virtual**: pega un enlace (Zoom, Meet, Teams)
   - **Presencial**: selecciona un aula
   - **Semi presencial**: selecciona un aula, igual que presencial (la clase combina asistencia física y virtual, pero el sistema solo necesita reservar el aula)
2. El **admin** aprueba o rechaza la propuesta
3. Si el **admin** mismo propone, se auto-aprueba inmediatamente

### Reglas
- Una vez aprobada, la ubicación queda fijada en el horario (campo `join_url` del horario, en texto plano — ver sección 11 sobre implicaciones)
- Si es presencial o semi presencial, se verifica que el aula no esté doblemente reservada
- Las propuestas ya revisadas no pueden re-revisarse

---

## 11. Aula Virtual (Lobby)

> Esta sección cambió sustancialmente respecto a la versión anterior del documento tras verificar el comportamiento real: **existen dos sistemas paralelos y desconectados entre sí.**

### El sistema realmente en uso
El flujo que efectivamente usan profesores y alumnos hoy es el enlace guardado en el **horario** (`Schedule.join_url`, texto plano) mediante el flujo de propuesta/aprobación de la sección 10:
- El **Lobby** del alumno muestra una cuenta regresiva y habilita la **vista previa** (prueba de cámara/micrófono) 15 minutos antes de la clase — esto es una regla de **interfaz**, no de backend
- El botón para **entrar** a la clase solo se habilita a la hora exacta de inicio (no a los 15 minutos)
- El profesor no tiene esa ventana de 15 minutos: puede entrar en cualquier momento del día de la clase
- **El mismo enlace se usa para profesor y alumno.** No hay distinción de "enlace de anfitrión" vs. "enlace de invitado" en este flujo
- **El backend no impone ninguna restricción horaria sobre el enlace**: un alumno matriculado puede leer el `join_url` del horario y acceder a él en cualquier momento, no solo durante la ventana de la clase. La cuenta regresiva y el "solo a la hora exacta" son controles visuales, no de seguridad

### El sistema construido pero no conectado
Existe además un módulo completo y probado — proveedores de reunión (Manual/Zoom/Google/Teams), credenciales cifradas con Fernet, `host_url` distinto y oculto para alumnos — pero **el frontend no lo consume en ninguna pantalla**. Es código funcional y con tests, pero no forma parte del flujo real que usan los usuarios. Vale la pena que el equipo decida si se termina de integrar o se retira, para no presentarlo como una capacidad ya operativa.

---

## 12. Reportes

### Tipos
| Período | Descripción |
|---------|-------------|
| **Diario** | Clases del día |
| **Semanal** | Clases de la semana (lunes a domingo) |
| **Mensual** | Clases del mes |

### Métricas incluidas
- Sesiones realizadas / canceladas
- % de asistencia por curso
- Promedio de notas
- **Alumnos en riesgo** (asistencia < 70% o promedio < 6.0 — umbrales confirmados en el código)

### ⚠️ Precisiones importantes sobre las métricas
- **"Sesiones realizadas" no distingue si ya ocurrieron**: se calcula como total menos canceladas. Una sesión futura dentro del período del reporte (por ejemplo, un reporte semanal generado a mitad de semana) ya cuenta como "realizada" aunque todavía no se haya dictado
- **Reprogramar una clase cuenta como cancelarla** a efectos de este reporte, porque técnicamente la sesión original queda marcada como cancelada. El reporte no distingue "se canceló la clase" de "se movió de fecha"
- **El promedio de notas y el criterio de "alumno en riesgo" solo consideran notas de sesión (nota del día), no las evaluaciones de curso ni la nota final.** Esto puede subestimar o distorsionar el riesgo real: un alumno con buenas notas de participación diaria pero mal examen final no aparecería como "en riesgo" en este reporte

### Alcance por rol
- **Admin**: reportes globales de toda la academia
- **Profesor**: solo sus cursos
- **Alumno**: solo su propio progreso, si está solvente

---

## 13. Notificaciones In-App

- Campana con contador de no leídos
- Se genera notificación automática (in-app, no email/SMS) al cancelar/reprogramar una clase, solo a alumnos con matrícula activa
- **"Alertas de alumnos en riesgo" son manuales, no automáticas**: un admin o profesor debe disparar la acción bajo demanda. El efecto es notificar **a los profesores** del curso sobre sus alumnos en riesgo — no notifica a los propios alumnos ni genera ninguna acción de seguimiento automática

---

## 14. Auditoría

- **Traza append-only** (solo lectura vía API; no hay forma de editar o borrar un registro)
- Registra: quién, qué, cuándo, valor anterior y valor nuevo
- Los campos sensibles (hash de contraseña, credenciales de proveedores de video) se **redactan**
- Solo accesible para **admin**

### ⚠️ Cobertura incompleta
"Todos los cambios importantes" es más acotado de lo que suena. La auditoría cubre: asistencia, calificaciones, usuarios, matrículas, certificados (sin valor anterior/nuevo) y propuestas de ubicación. **No cubre**: cambios al catálogo (idiomas, niveles, cursos, asignación de profesores) ni la cancelación/reprogramación de sesiones. Cancelar una clase, por ejemplo, no deja ninguna traza de quién lo hizo — solo genera la notificación al alumno.

---

## 15. Reglas de Autorización (Resumen)

| Recurso | Admin | Profesor | Alumno |
|---------|-------|----------|--------|
| CRUD usuarios | ✅ | ❌ | ❌ |
| CRUD catálogo (idiomas/tracks, niveles/módulos, cursos, nacionalidades) | ✅ | ❌ | ❌ |
| CRUD horarios | ✅ | ❌ | ❌ |
| CRUD matrículas | ✅ | ❌ | ❌ |
| Registrar cobros/pagos, emitir facturas (Finanzas) | ✅ | ❌ | ❌ |
| CRUD aulas | ✅ | ❌ | ❌ |
| Ver horario completo | ✅ | ✅ (toda la academia) | ❌ (solo sus cursos) |
| Pasar lista / Calificar | ✅ | ✅ (solo sus cursos) | ❌ |
| Leer sus notas/asistencia | ✅ | ✅ (de sus cursos) | ✅ (solo propias) |
| Proponer ubicación | ✅ (auto-aprueba) | ✅ (solo sus cursos) | ❌ |
| Aprobar/rechazar propuestas | ✅ | ❌ | ❌ |
| Acceder al Lobby | ✅ | ✅ (mismo enlace, sin distinción de host) | ✅ |
| Ver reportes | ✅ (global) | ✅ (sus cursos) | ✅ (solo propio, si solvente) |
| Auditoría | ✅ | ❌ | ❌ |
| Certificados | ✅ (emite) | ✅ (ver) | ✅ (descargar propio; verificar código requiere sesión iniciada) |

### Principios clave
- **404 en vez de 403 (parcialmente aplicado)**: en algunos endpoints (por ejemplo, reuniones y horarios individuales fuera del alcance del usuario) el sistema responde "no encontrado" para no confirmar la existencia del recurso. **No es un principio universal**: en el roster de un curso y en el directorio de usuarios, el sistema sí responde 403 (revela que el recurso existe pero el acceso está prohibido). Conviene no presentarlo como una garantía consistente en toda la API.
- **Rol nunca basta**: cada endpoint verifica además la **relación académica** (el profesor solo ve lo que enseña, el alumno solo lo suyo)
- Un usuario no puede cambiarse a sí mismo su propio rol, correo o tope de horas semanales
- Un admin no puede autoeliminarse; un profesor no puede eliminarse mientras tenga horarios asignados
- Al listar el roster de un curso, el profesor ve un perfil reducido del alumno (sin correo ni rol)

### Revocación de sesión al cambiar contraseña
Cambiar la contraseña (propia, o que un admin se la cambie a otro usuario) ahora **invalida de inmediato** todos los refresh tokens emitidos antes de ese cambio: cualquier sesión abierta en otro dispositivo deja de poder renovar su access token y tiene que iniciar sesión de nuevo. Esto cierra la ventana de hasta 30 días que existía antes si una contraseña quedaba comprometida.

**⚠️ Alcance de lo resuelto**: solo el cambio de contraseña dispara la revocación. Dar de baja/eliminar un usuario, o "cerrar sesión" desde el frontend, siguen sin revocar tokens ya emitidos en el servidor — "cerrar sesión" solo borra el token guardado en ese dispositivo. No existe tampoco un endpoint para que un usuario cierre manualmente sus otras sesiones activas.

---

## 16. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python + FastAPI + SQLAlchemy + PostgreSQL |
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Estado/Cache | TanStack Query (React Query) |
| Formularios | React Hook Form + Zod |
| Autenticación | JWT (access 30 min + refresh 30 días); el refresh se revoca al cambiar contraseña, pero no al dar de baja un usuario ni al cerrar sesión manualmente |
| Video | Enlace manual en el horario (flujo real); patrón Strategy con Zoom/Google/Teams cifrado (construido, no conectado al frontend) |
| Contenedores | Docker para PostgreSQL |

---

## 17. Hallazgos de la Revisión — Prioridades para Negocio

Resultado de contrastar este documento contra el código real. Ordenado por impacto potencial en la operación de la academia.

### Alto impacto — funcionalidad probablemente no intencional
1. **Un alumno no puede volver a matricularse en un curso del que desistió antes.** La unicidad (alumno, curso) no distingue por estado de matrícula → bloqueo permanente por ese curso.
2. **Reactivar una matrícula no revalida cupo ni choques de horario** → riesgo de sobre-cupo silencioso.
3. **Reprogramar una clase no valida que el profesor o el aula no tengan ya otra clase real ese día/hora** (solo revisa festivos y duplicados del mismo horario) → riesgo de doble reserva.
4. **El enlace de la clase virtual no tiene control de horario en el backend y es el mismo para profesor y alumno.** La cuenta regresiva de "15 minutos antes" y el botón que solo habilita a la hora exacta son controles de interfaz, no de seguridad: cualquier alumno matriculado puede acceder al enlace en cualquier momento.
5. **El módulo de proveedores de video con cifrado y enlaces separados de anfitrión/invitado no está conectado a ninguna pantalla real** — no protege el flujo que efectivamente usan los usuarios.
6. **"Promedio de notas" y "alumnos en riesgo" en los reportes ignoran exámenes y nota final**, considerando solo la nota de participación diaria — puede dar una imagen incompleta del riesgo real de un alumno.
7. **Cancelar o reprogramar una clase no queda en la auditoría** — no hay forma de saber quién lo hizo ni cuándo, más allá de la notificación que recibe el alumno.

### Medio impacto — conviene confirmar que es el comportamiento deseado
8. Los cambios al catálogo (cursos, niveles, idiomas/tracks, nacionalidades, asignación de profesores) no quedan auditados.
9. Un profesor recién creado, sin cualificaciones ni disponibilidad configuradas, puede ser asignado a cualquier curso y horario sin ninguna advertencia (postura "optimista" por diseño).
10. Las alertas de "alumnos en riesgo" son manuales y notifican a los profesores, no a los alumnos ni a un responsable de seguimiento.
11. Borrar un idioma o nivel elimina en cascada sus cursos, matrículas, notas y certificados, sin aviso adicional.
12. ~~No hay revocación de sesiones~~ — **resuelto parcialmente**: cambiar contraseña ahora sí revoca los refresh tokens ya emitidos; dar de baja/eliminar un usuario todavía no lo hace (ver sección 15).
13. El principio "404 en vez de 403" no se aplica de forma uniforme en toda la API.

### Bajo impacto — matices para no generar expectativas equivocadas
14. Las notificaciones son solo internas (in-app); no hay correo ni SMS.
15. Verificar un certificado por código requiere tener sesión iniciada en el sistema, no es un enlace público para terceros externos.
16. La asistencia y las calificaciones pueden registrarse sobre matrículas o sesiones ya canceladas ("Desistió"), sin bloqueo.

### Nuevo — pendiente de definición de negocio (requerimientos recién incorporados)
17. **Lista de nacionalidades**: la semilla actual reproduce el requerimiento original tal cual, que agrupaba países bajo "Centroamérica" sin que ninguno lo sea. Falta la lista real a ofrecer.
18. **Horarios de las jornadas Sabatino/Dominical (Matutina/Vespertina) y de la jornada Nocturna**: son valores por defecto razonables, no confirmados por negocio.
19. **Facturación es un comprobante interno**, no una factura con validez fiscal/electrónica. Si la operación real lo requiere, es trabajo adicional no cubierto todavía.
20. **Métodos de pago** (efectivo/tarjeta/transferencia/otro) y el **formato del correlativo** de matrícula y factura son convenciones del equipo, pendientes de confirmar con negocio.
21. **Dar de baja a un usuario no revoca sus tokens ya emitidos** (a diferencia de cambiar contraseña, que sí lo hace desde esta versión) — sigue teniendo acceso hasta que expire su refresh token, hasta 30 días.

---

*Documento generado para stakeholders — Educa v0.1.0 (Fase 1) — revisado y verificado contra el código fuente.*
