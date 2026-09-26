# Educa — Lógica de Negocio

## Sistema de Control Académico y Aula Virtual

> **Nota de esta revisión**: este documento fue verificado línea por línea contra el código del backend y frontend (no solo contra la intención de diseño). Donde el comportamiento real difiere de lo esperado, se marca explícitamente. La sección 17 resume los hallazgos que conviene que negocio revise antes de presentar el sistema como terminado.
>
> **Última revisión (julio 2026, 2ª pasada)**: se revisó la coherencia de la lógica de negocio entre módulos, no ya endpoint por endpoint. Lo encontrado fue que **las piezas no estaban de acuerdo entre sí**: los cinco estados de matrícula significaban cosas distintas según quién preguntara (con lo que el cupo era evitable y había alumnos "fantasma" que entraban a clase sin salir en la lista), el ciclo de vida admitía cualquier salto entre estados, el rol `assistant` estaba cableado a medio camino —el menú ofrecía secciones que la API rechazaba con 403—, y ninguna sesión llegaba jamás al estado "realizada", de modo que los reportes contaban como dictadas las clases que aún no habían ocurrido. Todo ello está corregido, documentado en las secciones 2, 6, 7, 12 y 14, y cubierto con pruebas. Ver hallazgos 27–34.
>
> **Revisión anterior (julio 2026)**: se auditó módulo por módulo contra el código y se corrigieron los hallazgos encontrados. Lo más relevante: **no existía aislamiento entre academias** (un admin podía leer y borrar datos de otra), **la ventana horaria del aula virtual era evitable** leyendo el enlace desde el horario, **el módulo de Finanzas no dejaba ninguna traza de auditoría**, y la hora de clase se calculaba con el reloj del servidor en vez del de la academia. Al reconstruir la base desde cero aparecieron además dos defectos de esquema que sólo afectaban a instalaciones nuevas (ver sección 17). Todo ello está corregido y cubierto con pruebas.
>
> **Actualización anterior**: se incorporaron los requerimientos de stakeholders (datos de contacto y nacionalidad de alumnos/profesores, catálogo académico generalizado a Competencias Digitales/Negocios, matrícula con código correlativo y cuota, un módulo de Finanzas con cargos/pagos/facturas, jornadas predefinidas de horario, y la modalidad "Semi presencial"). También se cerró la brecha de revocación de sesión al cambiar contraseña, señalada como hallazgo de alto impacto en la revisión anterior. Los puntos nuevos que todavía dependen de una decisión de negocio están marcados igual que el resto, con ⚠️.

---

## 1. Propósito del Sistema

Educa es una plataforma integral para la gestión de una academia que ofrece **idiomas y programas de competencias digitales y de negocios**. Su objetivo es centralizar en un solo lugar:

- La **gestión académica** (alumnos, profesores, cursos, horarios, matrículas)
- El **control de clases** (asistencia y calificaciones)
- El **aula virtual** (lobby para clases en vivo con Zoom/Meet/Teams)

---

## 2. Roles de Usuario

| Rol | Descripción | Lo que puede hacer |
|-----|-------------|-------------------|
| **Admin** | Dirección/administración de la academia | CRUD completo de usuarios, catálogo, horarios, matrículas; acceso a reportes globales y auditoría |
| **Assistant** | Personal administrativo con alcance recortado | Lo mismo que un admin, **pero sólo en las secciones que se le concedan** una a una (ver abajo). Nunca auditoría |
| **Teacher** | Profesor (idiomas o competencias) | Ver sus horarios, pasar lista, calificar, proponer ubicación de clase, acceder al lobby |
| **Student** | Alumno | Ver sus cursos, calificaciones, asistencia; acceder al lobby virtual |

### Asistente: permisos por sección

Un asistente es un admin al que se le recortó el alcance a una lista de permisos nombrados. Cada permiso corresponde a una sección del panel:

| Permiso | Abre |
|---|---|
| `manage_teachers` | Alta/edición de profesores, sus cualificaciones y disponibilidad |
| `manage_students` | Alta/edición de alumnos |
| `manage_catalog` | Idiomas/tracks, niveles, cursos, **aulas** y **festivos** |
| `manage_schedules` | Horarios, sesiones, ubicación de clase y proveedores de video |
| `manage_enrollments` | Matrículas |
| `manage_finance` | Cobros, pagos y emisión de comprobantes |
| `manage_grades` | Cuaderno de notas y asistencia |
| `view_reports` | Reportes de toda la academia |

Reglas que acotan el rol:
- **La lista de permisos es cerrada**: la API rechaza un permiso que no esté en ella. Antes se guardaba como texto libre, así que un `manage_finances` mal escrito se guardaba sin protestar y no concedía nada.
- **El directorio de usuarios responde sólo a `manage_teachers` y `manage_students`**, y cada uno muestra únicamente esa población. Un asistente de caja no ve la lista de personal.
- **Un asistente nunca gestiona otra cuenta de staff** (admin, superadmin u otro asistente), tenga los permisos que tenga, ni puede promover a nadie a un rol que él no gestione.
- **La auditoría es siempre sólo del admin**: reproduce todos los cambios de la academia, incluidos los de las personas a quienes el asistente reporta.
- Leer el horario, el listado de aulas y el calendario de festivos sigue abierto a cualquier usuario autenticado — un profesor necesita los tres. Lo que el permiso protege es **modificarlos**.

> Este rol se había quedado a medio cablear: sólo cuatro endpoints consultaban la lista de permisos y el resto seguía exigiendo rol de admin, así que **el menú ofrecía secciones que la API rechazaba con 403** (Aulas, Festivos, Horarios, Finanzas, editar usuarios), y Reportes devolvía un informe vacío sin explicar por qué. Ya no.

### Identificación personal (DPI / CUI, Pasaporte o DNI)

Toda cuenta que se da de alta lleva un documento de identidad **obligatorio**, y es **único dentro de la academia**: dos personas de la misma academia no pueden compartirlo, y la misma persona sí puede estar registrada en dos academias distintas.

Para que "el mismo documento" tenga una sola respuesta, se guarda siempre en **forma canónica**: sólo caracteres alfanuméricos, en mayúsculas. Da igual cómo se teclee — `2450 12345 0101`, `2450-12345-0101` y `2450123450101` son la misma identidad, igual que `AB123456` y `ab123456`. Sin esa normalización la unicidad no servía de nada: bastaba cambiar la puntuación para registrar dos veces a la misma persona.

La validación es **deliberadamente amplia**: entre 4 y 25 caracteres alfanuméricos. El documento puede ser un DPI/CUI guatemalteco, un pasaporte, un DNI o uno extranjero, y atarlo al formato de un solo país dejaría fuera a alumnos reales. Lo que se comprueba es que haya un identificador plausible, no que cumpla un patrón nacional concreto.

Las cuentas anteriores a este requisito pueden seguir sin documento; lo que no se admite es dar de alta una nueva sin él.

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

### Ciclo de vida del curso

Un curso no tenía estado propio: si estaba en preparación, admitiendo matrícula, impartiéndose o terminado había que **deducirlo de sus fechas**. Un curso a medio montar, sin horario y sin profesor, se veía igual que uno a punto de empezar — y nada impedía sentar alumnos en él.

| Estado | Significado | ¿Admite matrícula? | ¿Cuenta como activo? |
|---|---|---|---|
| **Borrador** | En preparación; aún no se puede ofrecer | No | No |
| **Abierto a matrícula** | Listo y admitiendo alumnos | Sí | Sí |
| **En curso** | Impartiéndose (la matrícula tardía es normal) | Sí | Sí |
| **Cerrado** | Terminado | No | No |
| **Archivado** | Fuera del listado, se conserva para el historial | No | No |

**Transiciones permitidas** (409 `illegal_transition` fuera de esta tabla):

```
Borrador  → Abierto, Archivado
Abierto   → En curso, Borrador, Archivado
En curso  → Cerrado
Cerrado   → Archivado, En curso   (reapertura por corrección)
Archivado → (final)
```

**Reglas de dependencia** — el movimiento existe, pero hay que *ganárselo*. La API responde 409 con la lista de lo que falta, no un "no" seco:

| Movimiento | Requiere |
|---|---|
| → **Abierto** | Fechas de inicio y fin, **al menos un profesor asignado** y **al menos un horario**. Sin eso, matricular a alguien produce una inscripción a algo que no se puede impartir |
| → **Borrador** | Ningún alumno ocupando plaza (volver a preparación lo sacaría de su vista sin darles de baja) |
| → **Archivado** | Ningún alumno ocupando plaza |

El estado se mueve por su propio endpoint (`POST /catalog/courses/{id}/status`), **no** por el `PATCH` genérico: cada movimiento tiene prerrequisitos y un patch los esquivaría todos. El listado oculta los archivados salvo que se pidan.

### Áreas académicas (Idiomas / Competencias Digitales / Competencias de Negocios)

La oferta académica ya no es solo idiomas. Cada "idioma" del catálogo lleva ahora una etiqueta de **área** (`kind`): **Idiomas**, **Competencias Digitales** o **Competencias de Negocios**. La jerarquía Idioma→Nivel→Curso es la misma para las tres áreas — no hay tablas ni pantallas separadas:
- **Idiomas**: Inglés, Español — el "nivel" es la etapa CEFR (A1..C2, incluido el "B1+" no estándar que ya usaba la academia)
- **Competencias Digitales**: Computación básica para adultos, Marketing Digital — el "nivel" pasa a ser el **módulo** (Módulo 1 a 4)
- **Competencias de Negocios**: Inteligencia Emocional, Emprendimiento — misma lógica de módulos

El Catálogo Académico (pantalla de administración) agrupa la lista de idiomas/tracks por esta etiqueta de área para mostrar las tres secciones que pide el negocio, pero por debajo sigue siendo el mismo catálogo genérico de siempre.

**Con auditoría**: crear/editar/borrar idioma, nivel, curso, nacionalidad y asignación de profesor **sí quedan registrados** en la auditoría, igual que matrículas y calificaciones.

**⚠️ Borrado en cascada**: eliminar un idioma o un nivel borra en cascada sus cursos, y con ellos matrículas y notas asociadas, sin ningún aviso o confirmación adicional a nivel de negocio.

---

## 4. Profesores

### Asignación a cursos
Un profesor debe ser **asignado explícitamente** a un curso (tabla de asignaciones profesor–curso) para poder impartirlo. La asignación **rechaza de forma dura (409, no overridable)** si el profesor no está cualificado en el idioma del curso.

No se puede desasignar a un profesor de un curso mientras tenga horarios activos en él (evita horarios huérfanos).

### Asignado al curso ≠ titular de la franja

Un profesor tiene **dos alcances distintos**, y conviene no confundirlos porque no dan los mismos permisos:

| Alcance | Qué es | Qué habilita |
|---|---|---|
| **Asignado al curso** | Tiene fila en la tabla profesor–curso | Calificar, pasar lista, poner y calificar tareas, ver el roster y las sesiones del curso, reportar sobre él |
| **Titular de la franja** | Es el `teacher_id` de ese horario semanal | Además: **generar, cancelar y reprogramar** las sesiones de esa franja, y entrar al aula virtual como anfitrión |

La diferencia es deliberada: cancelar la clase de un colega no es lo mismo que calificar en ella. Un curso con dos profesores asignados y una franja de cada uno mantiene a cada quien dueño de su propia clase, mientras ambos comparten libreta y lista.

**La negativa distingue a quién se la da.** A un profesor asignado al curso se le responde **403 con motivo** ("no eres el titular de esta franja"): ya ve esa franja en su listado de sesiones y califica sobre ella, así que un 404 mudo sólo se leería como un fallo del sistema. A quien no está asignado al curso se le responde **404**, que es lo que corresponde a algo que no debe saber que existe.

### Cualificación
- Se configura qué idiomas puede enseñar cada profesor
- Un profesor sin cualificaciones configuradas = puede enseñar cualquier idioma (postura "optimista" por defecto)
- Una vez que se le asigna al menos un idioma, solo puede enseñar esos
- **Dos niveles de rigor distintos**: al asignar el profesor a un curso, la cualificación es un bloqueo duro; al crear/editar un horario individual, la falta de cualificación es solo una advertencia overridable con `?force=true`. Conviene que negocio confirme si esta diferencia es intencional.

### Alta y baja

Un profesor que se va de la academia **no se puede borrar**: sus horarios referencian la fila, y sus notas y la asistencia que registró tienen que sobrevivirle. La baja es por tanto un interruptor (`is_active`), no un DELETE:

- Una cuenta de baja **no puede iniciar sesión**, y el efecto es inmediato sobre las sesiones ya abiertas — no sólo en el siguiente login.
- No aparece en ningún selector (asignar curso, crear horario, reasignar).
- **La baja se rechaza mientras el profesor imparta cursos activos** (409 `has_live_assignments`), porque dejaría esas clases sin nadie que pueda pasar lista. El error **enumera los cursos a reasignar**, y el panel lo convierte en el flujo de traspaso: el bloqueo es la puerta de entrada al arreglo, no un callejón sin salida.
- Se puede reactivar en cualquier momento.

### Traspaso de cursos (reasignación en lote)

`POST /teachers/{id}/reassign` pasa los cursos de un profesor a otro — y con ellos sus franjas horarias. Es la operación que hace falta dos veces: cuando alguien se va (donde es requisito para la baja) y cuando alguien se ausenta a mitad de trimestre.

- El destino queda asignado al curso **antes** de que ninguna franja le apunte, porque todo horario exige que su profesor esté asignado al curso.
- **La cualificación es un bloqueo duro**, igual que en el resto del sistema: `force` no la salta.
- El resultado es **por curso**, no todo-o-nada: si se mueven seis y uno choca con el martes del destino, quedan cinco movidos y uno explicado — no siete sin tocar.

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
- Al cancelar/reprogramar, se genera una notificación (campana in-app) a los alumnos con matrícula activa, que sale además por correo y WhatsApp según los canales configurados y las preferencias de cada alumno (`notify_email`, `notify_whatsapp`); ver `app/services/delivery.py`
- **La reprogramación SÍ valida choques reales**: comprueba disponibilidad del profesor, otros horarios semanales del profesor, disponibilidad del aula, y sesiones concretas ya existentes en esa fecha/hora (protegido además por constraint de exclusión GiST en `ClassSession`)
- **Tanto cancelar como reprogramar quedan en la auditoría** (`entity=class_session`, actions `cancel` y `reschedule`) con before/after, actor y timestamp

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

| Estado | Significado | ¿Ocupa cupo? | ¿Entra a clase? | ¿Debe dinero? |
|---|---|---|---|---|
| **Inscrito** | Recién matriculado, aún no arrancó o no se activó formalmente | Sí | Sí | Sí |
| **Activo** | Cursando con normalidad | Sí | Sí | Sí |
| **Inactivo** | En pausa (sin ser baja definitiva) | No — libera el cupo | No | Sí |
| **Graduado** | Terminó y aprobó el curso (antes "Certificado") | No | No | No |
| **Desistió** | Dio de baja el curso (antes "cancelada") | No | No | No |

Las tres columnas de la derecha son **la definición del estado**, no una descripción de él: viven en un solo sitio del código (`ENROLLMENT_OCCUPIES_SEAT`, `ENROLLMENT_HAS_ACCESS`, `ENROLLMENT_OWES`) y todos los módulos las consultan de ahí.

> Antes cada módulo llevaba su propia lista de estados "que cuentan", y no coincidían: el cupo contaba sólo *Activo*, el aula virtual admitía *Activo* e *Inscrito*, y la lista para pasar lista volvía a contar sólo *Activo*. El resultado era que un alumno **Inscrito** entraba a la clase virtual y recibía tareas, pero **no aparecía en la lista para pasar lista, no ocupaba cupo, no disparaba validación de choque de horario y no recibía aviso si le cancelaban la clase**. Un curso de 10 plazas aceptaba cualquier número de matrículas creadas como *Inscrito*.

#### Transiciones permitidas

El ciclo de vida es un camino, no cinco etiquetas intercambiables. El backend rechaza (409 `illegal_transition`) cualquier movimiento fuera de esta tabla, y el panel sólo ofrece los legales:

```
Inscrito  → Activo, Inactivo, Desistió
Activo    → Inactivo, Graduado, Desistió
Inactivo  → Activo, Desistió
Graduado  → (final)
Desistió    → (final)
```

**Graduado** y **Desistió** son estados finales a propósito: el primero cerró el curso con una nota final aprobatoria, y readmitir a quien desistió es una **matrícula nueva con su propio código** — que el índice único parcial sobre (alumno, curso) permite explícitamente. Volver a *Activo* desde cualquiera de los dos requiere reactivar el cupo y el horario, revalidados en ese momento.

### Bloqueos
- **`attendance_blocked`**: bloqueo disciplinario. En la práctica solo impide abrir el **detalle** de una sesión puntual (donde está el enlace de la clase); el alumno sigue viendo el listado/calendario general de sesiones
- **Solvencia**: si el pago está vencido, el alumno no puede ver notas ni reportes

### Finanzas de la matrícula (cuota, cargos, pagos y facturas)

Cada matrícula puede llevar una **cuota** (el monto acordado). A partir de esa cuota se lleva un **libro de movimientos** (ledger) por matrícula, con dos tipos de entrada:
- **Cobro** (cargo): dinero que se le debe a la academia. Se crea uno automático por el monto de la cuota al matricular (si la cuota es 0, no se crea ningún cargo).
- **Pago**: dinero efectivamente recibido (efectivo, tarjeta, transferencia u otro método).

El **saldo** de una matrícula (`cargado − pagado`) siempre se calcula al vuelo a partir de esos movimientos — nunca se guarda como un número aparte, así que no puede quedar desincronizado.

Sobre ese ledger, un admin puede emitir una **factura** (comprobante interno, no una factura fiscal/electrónica): un recibo numerado con código correlativo propio y PDF descargable. Se emite **por el dinero recibido que todavía no se ha facturado**, no por el total pagado: si ya hay un comprobante por 100 y luego entran 40, la siguiente factura es de 40. Sin pagos nuevos que cubrir, se rechaza (409) en vez de emitir un duplicado — de lo contrario dos comprobantes sumados harían aparecer a la academia cobrando el doble de lo que entró en caja.

La **morosidad** se recalcula con un barrido (`POST /payments/refresh-statuses`), pensado para dispararse por cron: el estado "en mora" llega por el calendario y no porque nadie toque el registro. El barrido alcanza **sólo a la academia de quien lo ejecuta**.

**⚠️ Puntos pendientes de confirmar:**
- Los **métodos de pago** ofrecidos hoy (efectivo, tarjeta, transferencia, otro) son un punto de partida razonable, no una lista confirmada por negocio.
- El comprobante que se emite es un **recibo interno**, sin integración con ningún esquema de facturación electrónica/fiscal. Si la operación real de la academia requiere facturación con validez fiscal (por ejemplo, DTE), es un desarrollo aparte, no cubierto todavía.
- El formato del correlativo (matrícula: `AAAA-00001`; factura: `FAC-AAAA-00001`) es una convención elegida por el equipo, no un formato pedido explícitamente por negocio.

El **saldo pendiente** de cada matrícula (`cargado − pagado`) se muestra ahora en el propio listado de matrículas, junto al estado de pago: el badge dice si el dinero está en mora, la columna dice cuánto. Se calcula para toda la lista en una sola consulta agregada, no una por fila.

### Renovación al siguiente nivel

Quien se **gradúa** de un curso ve en su inicio la tarjeta «Tu siguiente nivel»: los grupos abiertos del nivel siguiente del mismo idioma o área, con horario, cupo restante y aviso si chocan con otra clase suya. Elige uno y **pide plaza** (`POST /renewals`).

- **Pedir no es matricularse.** La solicitud no ocupa cupo ni genera deuda. Dirección (admin, o asistente con `manage_enrollments`) la ve en la bandeja «Requiere tu atención» del inicio y la aprueba o rechaza desde **Matrículas**; no hay sección nueva.
- **Aprobar abre la matrícula por la misma puerta que la manual** (`open_enrollment`): se vuelven a comprobar cupo, choque de horario y estado del curso, porque pudieron cambiar desde que el alumno pidió. Nace como **Inscrito**.
- **Cuota:** la de la matrícula que el alumno termina, fijada al pedir. Vence al inicio del nuevo grupo (o hoy, si ya empezó). Dirección puede ajustarla después como cualquier otra.
- **Rechazar** admite un motivo opcional que el alumno ve; puede elegir otro grupo enseguida.
- Una sola solicitud **pendiente** por curso terminado (índice único parcial); el alumno puede cancelarla mientras siga pendiente.
- Un alumno **en mora** no puede pedir plaza: la tarjeta le pide ponerse al día.
- «Nivel siguiente» es el siguiente `Level` del mismo idioma/área por orden de creación (A1 → A2, Módulo 2 → Módulo 10), no por código.
- Se notifica a dirección al pedir y al alumno al aprobar o rechazar (in-app, correo y push; no WhatsApp, que exige plantillas aprobadas).

### Borrado vs. baja

**Una matrícula con expediente académico no se puede borrar** (409 `has_academic_record`). Si tiene notas o asistencia registrada, el DELETE se rechaza y el error dice cuánto hay de cada cosa; la vía para darla de baja es marcarla **Desistió**, que conserva todo. El borrado arrastraba ese expediente en cascada y la fila de auditoría sólo guardaba la matrícula — no las notas que desaparecían con ella, de modo que era la única operación del sistema capaz de destruir historial sin dejar rastro de qué había.

El DELETE sigue existiendo para lo que sí es un error de captura: una matrícula recién creada sobre la que todavía nadie escribió nada. Borrar un **curso** con matrículas está directamente bloqueado (409): hay que vaciarlo antes.

---

## 7. Asistencia

### Marcación
El profesor marca asistencia para cada matrícula en cada sesión:

| Estado | Atajo | Significado | Cómo cuenta en la tasa |
|--------|-------|-------------|------------------------|
| **Presente** | `P` | Asistió | A favor |
| **Tarde** | `T` | Llegó tarde | A favor — llegar tarde es haber venido |
| **Ausente** | `A` | No asistió | En contra |
| **Justificada** | `J` | Falta con constancia | **Ni a favor ni en contra** |

### Cómo se calcula la tasa de asistencia

Son dos preguntas distintas —quién vino y qué clases cuentan— y hay **una sola respuesta para todo el sistema** (`ATTENDANCE_IS_PRESENT` y `ATTENDANCE_COUNTS_TOWARD_RATE`).

La **falta justificada sale del cálculo por completo**: no es una asistencia que el alumno no tuvo, pero tampoco una falta que deba pesarle. De diez clases con una justificada, su tasa se calcula sobre nueve. Si todas sus marcas son justificadas no hay tasa que dar (`null`), en lugar de un 0% que castigaría a quien avisó y presentó constancia.

> Esto era antes tres reglas distintas conviviendo: el reporte contaba la justificada como ausencia, el kardex la contaba como asistencia y el panel del alumno como ausencia otra vez. El mismo alumno tenía tres tasas según la pantalla que abriera. La opción «Justificada», además, existía en el modelo desde el principio y **la interfaz nunca la ofreció**, así que una incapacidad médica sólo podía registrarse como ausencia.

### Reglas
- **Upsert idempotente y atómico**: volver a marcar reemplaza la marca anterior (no acumula), protegido contra condiciones de carrera por una restricción única en base de datos
- Una matrícula solo puede tener **una** marca de asistencia por sesión
- Todos los cambios quedan registrados en la **auditoría**

### Validaciones de estado
- **No se puede pasar lista sobre una matrícula cerrada** (Desistió, Graduado o Inactivo): quien ya no está en el aula no puede estar presente ni ausente de ella, y registrarlo movía en silencio la tasa de asistencia sobre la que se calculan los reportes y los alumnos en riesgo. Responde 409.
- **No se puede pasar lista sobre una sesión cancelada**: nadie asistió a una clase que no se dio. Responde 409.
- Ambas reglas valen igual para las **calificaciones** (sección 8).

### La clase ocurrió vs. la lista está registrada

Son dos hechos distintos y el sistema los guarda por separado.

**Que la clase ocurrió** (`status = held`) lo escribe la primera marca de asistencia: nadie pasa lista de una clase que no se dio. Corregir una marca no lo cambia, y **nunca revive una sesión cancelada** — eso es una decisión explícita (`PATCH /sessions/{id}`), no un efecto secundario.

**Que la lista quedó registrada** lo afirma el profesor cerrándola (`POST /sessions/{id}/close-register`). Es lo que el reporte cuenta como sesión realizada y lo que saca la clase de sus pendientes.

La distinción importa porque antes no existía: bastaba marcar a un alumno para que la sesión figurara como registrada, de modo que **una lista con 3 de 30 contaba igual que una con 30 de 30**, y desaparecía de los pendientes del profesor con el trabajo a medias.

- Cerrar **exige que todos los que ocupan plaza tengan marca**. Si faltan, responde 409 con cuántos son, y la interfaz ofrece cerrar igualmente (`?force=true`) — el caso real del alumno que no apareció y a quien el profesor no quiere marcar.
- Cerrar es también afirmar que la clase se dio: arrastra el `held`.
- **Se puede reabrir** (`POST /sessions/{id}/reopen-register`) para corregir. Reabrir no deshace el `held`: lo que se reabre es el registro, no el hecho.
- Cerrar y reabrir son del **profesor titular de la franja**, como generar, cancelar y reprogramar (sección 4), y **ambos quedan en la auditoría**.

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
- **No se califica sobre una sesión cancelada** ni sobre una **matrícula cerrada** (409). Lo segundo importa especialmente en *Graduado*: la matrícula se cerró con esa nota final, y recalificar después la dejaría en desacuerdo con el veredicto que el alumno ya recibió

### Nota final
- Se calcula como **promedio ponderado** usando los pesos configurados por evaluación
- Si no hay pesos configurados, todas las evaluaciones pesan 1.0
- El alumno **aprueba** si su nota final ≥ `passing_score` del curso

> **Ver sección 12**: el "promedio de notas" que muestran los **reportes** es distinto de esta nota final — solo considera notas de sesión, no evaluaciones/exámenes.

---

## 9. Certificados

Educa **no emite certificados**: la certificación se gestiona fuera del sistema. Lo que Educa sí da es la nota final ponderada y el veredicto aprobado/no aprobado, y el estado de matrícula **Graduado** para quien terminó y aprobó. La tabla `certificates` se eliminó (`drop_certificates_table`) y el estado `certified` pasó a llamarse `graduated`.

---

## 10. Ubicación de Clases (Propuesta/Aprobación)

### Qué necesita cada modalidad

Son **dos preguntas independientes** —¿ocupa un aula? ¿hace falta un enlace?— y cada modalidad las responde por su cuenta. La respuesta vive en un solo sitio (`MODALITY_USES_ROOM` y `MODALITY_NEEDS_LINK`), no en un `if virtual … else …`.

| Modalidad | Aula | Enlace | Qué es |
|---|:---:|:---:|---|
| **Presencial** | ✅ obligatoria | ❌ | La clase ocurre en el centro y sólo ahí |
| **Semi presencial** | ✅ obligatoria | ✅ obligatorio | La clase ocurre **en el aula y en línea a la vez** |
| **Virtual** | ❌ | ✅ obligatorio | La clase ocurre sólo en línea |

Lo que una modalidad no usa **no se guarda**: un aula reservada por una clase virtual la bloquearía para quien sí la necesita, y un enlace colgando de una presencial es una puerta que nadie vigila.

> Antes, «semi presencial» se trataba como «todo lo que no es virtual»: pedía aula y **borraba el enlace en silencio**. La mitad en línea de una clase híbrida no existía en ninguna parte, y el alumno que no podía asistir no tenía adónde conectarse. El formulario del asistente de cursos, además, enviaba un enlace que su propio formulario nunca dejaba escribir.

### Dónde se define, y quién la ve

La modalidad vive en el **horario**, no en el curso: es la franja la que ocupa un aula concreta a una hora concreta, y un curso puede tener franjas distintas.

- **Dirección la elige al crear el horario**, en el asistente de cursos, y se aplica a todas las franjas que ese asistente crea. Hasta ahora el campo existía en el formulario pero **el API no lo aceptaba** —`ScheduleCreate` no lo declaraba y Pydantic descarta lo que no declara—, así que toda franja nacía presencial sin enlace dijera lo que dijera la pantalla, y la única forma de corregirlo era después, una por una, con el flujo de propuesta.
- Crear un horario **no exige** aula ni enlace todavía: se puede montar el calendario antes de saber dónde se dará, y para eso está la propuesta. Lo que sí se rechaza es lo **incoherente** (un enlace en una presencial, un aula en una virtual), porque eso no es información incompleta sino equivocada.
- **La modalidad del curso se deduce de sus franjas**, no se guarda aparte: si todas coinciden, esa es; si no, es **«Modalidad mixta»**. Un campo propio en el curso podría decir "virtual" mientras una de sus franjas reserva aula, que es exactamente la doble verdad que este sistema evita en todo lo demás.

Se muestra así:

| Rol | Dónde lo ve |
|---|---|
| **Dirección** | La elige en el asistente; la cola de aprobación muestra las dos mitades de cada propuesta |
| **Profesor** | Etiqueta de la modalidad del curso en la cabecera de cada grupo, y la de cada franja en su fila; el panel de ubicación pide lo que esa modalidad necesita |
| **Alumno** | En la tarjeta de cada curso, y en la próxima clase de su portada — que además le dice el aula en vez de ofrecerle un botón de conexión si es presencial |

### Flujo
1. El **profesor** propone dónde dará la clase, con las piezas que su modalidad exige
2. El **admin** aprueba o rechaza la propuesta
3. Si el **admin** mismo propone, se auto-aprueba inmediatamente

### Reglas
- Una vez aprobada, la ubicación queda fijada en el horario (campo `join_url` del horario, en texto plano — ver sección 11 sobre implicaciones)
- **Toda modalidad que reserve aula** (presencial y semi presencial) se verifica contra doble reserva, tanto al proponer como al aprobar — el aula pudo ocuparse entremedias. Un choque responde 409, incluso si lo detecta la restricción del esquema en lugar de la comprobación previa
- Las propuestas ya revisadas no pueden re-revisarse
- La cola de aprobación muestra **las dos mitades** de lo que se está aprobando; antes enseñaba sólo una, así que quien aprobaba una híbrida no veía el enlace que aprobaba

---

## 11. Aula Virtual (Lobby)

> Esta sección cambió sustancialmente respecto a la versión anterior del documento tras verificar el comportamiento real: **existen dos sistemas paralelos y desconectados entre sí.**

### Una clase presencial no tiene lobby

El lobby existe para **virtual y semi presencial**, que son las modalidades donde hay una sala que abrir. Quien tiene una clase **presencial** ve en su lugar dónde y a qué hora: el aula, su capacidad, y un aviso si dirección todavía no la ha asignado.

Antes el lobby era el mismo para las tres. A un alumno que tiene que cruzar la ciudad hasta el centro se le ponían delante una prueba de cámara y micrófono, una cuenta regresiva y un botón de «Entrar a la clase en vivo» — no una pantalla neutra, sino una instrucción equivocada.

### El sistema realmente en uso
El flujo que efectivamente usan profesores y alumnos hoy es el enlace guardado en el **horario** (`Schedule.join_url`, texto plano) mediante el flujo de propuesta/aprobación de la sección 10:
- El **Lobby** del alumno muestra una cuenta regresiva y habilita la **vista previa** (prueba de cámara/micrófono) 15 minutos antes de la clase
- **La ventana la impone el backend, no la interfaz.** `GET /meetings/session/{id}/lobby-info` sólo entrega el enlace dentro de la ventana: desde 15 minutos antes del inicio hasta la hora de finalización de la clase. Fuera de ese rango responde sin enlace y con el motivo
- El enlace **ya no puede leerse desde el horario**: `GET /schedules` omite `join_url` para los alumnos, así que la ventana no es evitable por otra vía
- Una sesión **cancelada** no admite a nadie, ni siquiera al profesor
- El profesor/admin no está sujeto a la ventana de 15 minutos: puede entrar en cualquier momento del día de la clase, y es el único que recibe `host_url`
- **La hora de la clase se interpreta en la zona horaria de la academia** (`ACADEMY_TIMEZONE`, por defecto `America/Guatemala`), no en la del servidor. Antes se comparaba contra el reloj local del servidor, lo que descuadraba la ventana tantas horas como diferencia hubiera (6 horas en un servidor UTC)

### El sistema construido pero no conectado
El módulo de proveedores de reunión (Manual/Zoom/Google/Teams, credenciales cifradas con Fernet, `host_url` oculto para alumnos) **sí está parcialmente conectado**: existe la pantalla de administración `VideoProvidersPanel` y el Lobby consume el endpoint `lobby-info`. Lo que no está conectado es la *creación automática* de reuniones por proveedor en el alta de un horario; el flujo habitual sigue siendo el enlace manual. Conviene decidir si se completa esa última pieza o se retira.

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
- **Alumnos en riesgo** (asistencia < 70 %, promedio < 6.0, una habilidad < 6.0, o las `CONSECUTIVE_ABSENCES_ALERT` = 2 últimas clases registradas como falta — `app/services/reports.py`)

### Precisiones importantes sobre las métricas
- **"Sesiones realizadas" ahora significa "clase con lista pasada"**, no "clase que nadie canceló". Antes se calculaba como `total − canceladas`, de modo que un reporte semanal generado el lunes ya contaba la clase del viernes como dictada. Lo que no está ni dictado ni cancelado aparece aparte, como **"Sin registrar"** — que es a la vez lo que está por venir y lo que pasó sin que nadie pasara lista
  - Las instalaciones existentes se rellenan con una migración (`a1b2c3d4e5f6`) que marca como realizadas las sesiones pasadas **que tienen asistencia registrada**. Las que no la tienen se quedan sin registrar a propósito: nadie dejó constancia de que ocurrieran, e inventarlo sería peor que reportarlas como pendientes
- **Reprogramar una clase cuenta como cancelarla** a efectos de este reporte, porque técnicamente la sesión original queda marcada como cancelada. El reporte no distingue "se canceló la clase" de "se movió de fecha"
- **El promedio de notas y el criterio de "alumno en riesgo" consideran ahora tanto las notas de sesión como las evaluaciones de curso**, y ambos miden lo mismo. Las evaluaciones se filtran por la fecha en que se registraron, así que un reporte semanal ya no arrastra exámenes de meses anteriores

### Alcance por rol
- **Admin**: reportes globales de toda la academia
- **Profesor**: solo sus cursos
- **Alumno**: solo su propio progreso, si está solvente

---

## 13. Notificaciones In-App

- Campana con contador de no leídos
- Se genera notificación automática (in-app, más correo/WhatsApp si están configurados) al cancelar/reprogramar una clase, solo a alumnos con matrícula activa
- **Alertas de alumnos en riesgo: semanales y automáticas** (`app/services/risk_sweep.py`). La API las lanza desde su bucle de fondo (`app/services/background.py`) los lunes desde las 7:00 de la academia, sobre las últimas cuatro semanas (`period="last4w"`) de los cursos en `open`/`in_progress`. Avisan a los profesores de cada curso y a admins/asistentes de la academia con la lista nominal. `at_risk_sweeps` registra cada barrido y su índice único `(COALESCE(tenant_id,0), week_start)` garantiza uno por semana y academia aunque haya varios procesos. Se conserva el disparo manual (`POST /notifications/alerts/at-risk`).

---

## 14. Auditoría

- **Traza append-only** (solo lectura vía API; no hay forma de editar o borrar un registro)
- Registra: quién, qué, cuándo, valor anterior y valor nuevo
- Los campos sensibles (hash de contraseña, credenciales de proveedores de video) se **redactan**
- Solo accesible para **admin**

### Cobertura
La auditoría cubre hoy: asistencia, calificaciones, usuarios (incluida el alta), **matrículas — incluida su creación**, propuestas de ubicación, **el catálogo completo**, **cancelar/reprogramar/editar sesiones**, **el borrado de horarios**, **el módulo de Finanzas** (cobros, pagos y emisión de facturas), **aulas**, **festivos**, **las academias mismas (alta y edición)**, y **las cualificaciones y la disponibilidad de los profesores**.

Crear una matrícula era el hueco más notorio: es la puerta de entrada académica *y* financiera del sistema — sienta a un alumno, abre un libro de movimientos y emite un código — y editarla y borrarla ya se auditaban, pero crearla no dejaba rastro.

Las **academias** eran el otro: dar de alta una institución o cambiarle el `max_active_students` —el cupo contratado de su plan, es decir su límite comercial— eran los únicos writes del sistema que no dejaban traza, mientras una nota de un examen sí la dejaba.

**⚠️ Lo que sigue sin auditarse**: proveedores de video, tareas y notificaciones.

---

## 15. Reglas de Autorización (Resumen)

### Matriz CRUD de las tres entidades del administrador

| Operación | Permiso | Reglas que la condicionan |
|---|---|---|
| **Curso** — crear | `manage_catalog` | Nace en **Borrador** |
| **Curso** — leer | cualquiera autenticado | El alumno sólo ve los suyos; los archivados quedan fuera del listado por defecto |
| **Curso** — editar | `manage_catalog` | Bajar el cupo por debajo de las plazas ocupadas: 409. Cambiar fechas propaga el término a los horarios y puede chocar: 409 |
| **Curso** — cambiar estado | `manage_catalog` | Tabla de transiciones + reglas de dependencia (arriba). Endpoint propio |
| **Curso** — borrar | `manage_catalog` | 409 si tiene matrículas: hay que vaciarlo antes |
| **Profesor** — crear | `manage_teachers` | — |
| **Profesor** — leer | cualquiera autenticado (id y nombre) | Los de baja no salen en los selectores |
| **Profesor** — editar | `manage_teachers` | Cualificaciones y disponibilidad auditadas; ventanas solapadas: 409 |
| **Profesor** — dar de baja | `manage_teachers` | 409 si imparte cursos activos, enumerándolos |
| **Profesor** — reasignar cursos | `manage_teachers` | Cualificación obligatoria; resultado por curso |
| **Profesor** — borrar | `manage_teachers` | 409 si tiene horarios. La vía normal es la baja |
| **Alumno** — crear | `manage_students` | — |
| **Alumno** — leer | `manage_students` | Un asistente ve sólo la población que gestiona |
| **Alumno** — editar | `manage_students` | No puede ser promovido a un rol que el actor no gestione |
| **Alumno** — dar de baja | `manage_students` | Conserva matrículas, notas y asistencia. Para sacarlo de *un curso* se usa **Desistió** |
| **Alumno** — matricular (individual o en lote) | `manage_enrollments` | Estado del curso, duplicado, cupo y choque de horario — por alumno |

El **estado del alumno no se almacena**: se deriva de sus matrículas (Cursando / Sin curso / En mora / Egresado), coherente con la decisión de que el ciclo de vida académico vive en la matrícula y no en la persona.

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
| Acceder al Lobby | ✅ (como anfitrión) | ✅ (anfitrión sólo de las franjas que imparte) | ✅ (como asistente) |
| Ver reportes | ✅ (global) | ✅ (sus cursos) | ✅ (solo propio, si solvente) |
| Auditoría | ✅ | ❌ | ❌ |

### Aislamiento entre academias (multi-tenant)

El sistema soporta **varias academias sobre una misma instalación**. Cada usuario pertenece a una academia (`tenant`) y **sólo ve y opera sobre los datos de la suya**: usuarios, catálogo, cursos, horarios, sesiones, matrículas, aulas, festivos, finanzas, reportes y auditoría están acotados por academia.

- El tenant se lee **siempre del usuario autenticado**, nunca de nada que envíe el cliente: elegir "de quién son estos datos" no puede quedar en manos de quien pregunta.
- Un recurso de otra academia responde **404**, no 403: confirmar que existe ya sería filtrar información entre academias.
- El **superadministrador** es deliberadamente *sin academia* (`tenant_id` nulo) y sí ve todas — es la cuenta que administra el conjunto.
- El **catálogo es propio de cada academia**: dos academias pueden tener su propio "Inglés" y su propio calendario de festivos.
- Las **nacionalidades** son la única lista deliberadamente **global** (es un listado de países, no un dato de academia).
- El aislamiento vale también para los **procesos por lotes**, no sólo para las consultas: el barrido de morosidad recalcula únicamente las matrículas de la academia de quien lo ejecuta, y el número de filas afectadas que devuelve cuenta sólo las suyas.
- La **identificación personal es única por academia**, no globalmente: una misma persona puede estudiar en dos academias de la misma instalación.

### Principios clave
- **404 en vez de 403 (parcialmente aplicado)**: en algunos endpoints (por ejemplo, reuniones y horarios individuales fuera del alcance del usuario) el sistema responde "no encontrado" para no confirmar la existencia del recurso. **No es un principio universal**: en el roster de un curso y en el directorio de usuarios, el sistema sí responde 403 (revela que el recurso existe pero el acceso está prohibido). Conviene no presentarlo como una garantía consistente en toda la API.
- **Rol nunca basta**: cada endpoint verifica además la **relación académica** (el profesor solo ve lo que enseña, el alumno solo lo suyo)
- Un usuario no puede cambiarse a sí mismo su propio rol, correo o tope de horas semanales
- Un admin no puede autoeliminarse; un profesor no puede eliminarse mientras tenga horarios asignados
- Al listar el roster de un curso, el profesor ve un perfil reducido del alumno (sin correo ni rol)

### Revocación de sesión al cambiar contraseña
Cambiar la contraseña (propia, o que un admin se la cambie a otro usuario) ahora **invalida de inmediato** todos los refresh tokens emitidos antes de ese cambio: cualquier sesión abierta en otro dispositivo deja de poder renovar su access token y tiene que iniciar sesión de nuevo. Esto cierra la ventana de hasta 30 días que existía antes si una contraseña quedaba comprometida.

**Alcance real (verificado en código)**: la revocación en servidor la disparan **tres** acciones, no solo una:
- **Cambiar la contraseña** invalida todos los refresh tokens anteriores (`token_version`).
- **Cerrar sesión** revoca ese refresh token en servidor (`POST /auth/logout`), no solo lo borra del dispositivo.
- **Eliminar un usuario** revoca sus sesiones activas antes de borrarlo.

Sigue sin existir un endpoint para que un usuario cierre a voluntad *sus otras* sesiones activas sin cambiar la contraseña.

---

## 16. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python + FastAPI + SQLAlchemy + PostgreSQL |
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Estado/Cache | TanStack Query (React Query) |
| Formularios | React Hook Form + Zod |
| Autenticación | JWT (access 30 min + refresh **7 días**, rotado en cada uso con detección de reutilización); el refresh se revoca al cambiar contraseña, al cerrar sesión y al dar de baja al usuario |
| Video | Enlace manual en el horario (flujo real); patrón Strategy con Zoom/Google/Teams cifrado (construido, no conectado al frontend) |
| Contenedores | Docker para PostgreSQL |

---

## 17. Hallazgos de la Revisión — Prioridades y Estado de Alineación

Resultado de contrastar este documento contra el código real del backend y frontend. Los hallazgos de alto impacto han sido **alineados y resueltos** en el código fuente.

### Alto impacto — Resueltos y Alineados en Código ✅
1. ~~**Un alumno no puede volver a matricularse en un curso del que desistió antes.**~~ — **RESUELTO**: La unicidad (alumno, curso) aplica ahora con índice parcial sobre matrículas no desistidas (`status != 'withdrawn'`). Un estudiante que desistió puede volver a matricularse.
2. ~~**Reactivar una matrícula no revalida cupo ni choques de horario**~~ — **RESUELTO**: Al cambiar el estado de una matrícula a `active` (`update_enrollment`), el backend revalida automáticamente la capacidad del curso (`max_students`) y los choques de horario del alumno.
3. ~~**Reprogramar una clase no valida choques reales**~~ — **RESUELTO (completado)**: además de los patrones semanales del profesor y del aula, `reschedule_session` compara contra las **sesiones concretas** ya existentes en esa fecha —lo que antes permitía que dos recuperaciones se pisaran— y rechaza fechas pasadas.
4. ~~**El enlace de la clase virtual no tiene control de horario en el backend y es el mismo para profesor y alumno.**~~ — **RESUELTO (completado)**: el alumno ya no recibe `host_url`, **y** la ventana horaria se impone en el backend. La corrección anterior estaba incompleta: el mismo enlace seguía siendo legible sin restricción desde `GET /schedules`, lo que dejaba la ventana sin efecto. Ver sección 11.
5. ~~**"Promedio de notas" y "alumnos en riesgo" ignoran exámenes**~~ — **RESUELTO (completado)**: ambas métricas cuentan ahora las mismas notas (sesión + evaluaciones), acotadas al período del reporte.
6. ~~**Cancelar o reprogramar una clase no queda en la auditoría**~~ — **RESUELTO**: Operaciones de cancelación y reprogramación de sesiones registran ahora eventos detallados en `audit_log`.
7. ~~**Revocación de sesiones al cambiar contraseña**~~ — **RESUELTO**: Cambiar la contraseña invalida inmediatamente todos los tokens de refresco emitidos previamente.
8. ~~**No existía aislamiento entre academias.**~~ — **RESUELTO**: era el hallazgo más grave y no figuraba en este documento. Un admin de una academia podía **listar, leer, modificar y eliminar** usuarios de otra, y leer su catálogo, horarios, matrículas, finanzas y auditoría. Ahora todo el acceso está acotado por academia y hay una batería de pruebas de aislamiento. Ver sección 15.
9. ~~**La ventana del aula virtual usaba el reloj del servidor.**~~ — **RESUELTO**: la hora de clase se interpreta en `ACADEMY_TIMEZONE`; en un servidor UTC la ventana se abría 6 horas antes de lo debido.

### Defectos de esquema encontrados al reconstruir la base desde cero
Ninguno se manifestaba en bases de datos migradas de forma incremental, sólo en **instalaciones nuevas** — es decir, en producción recién desplegada y en CI:
- **`grades` quedaba sin ningún índice único**: una migración autogenerada borró los índices parciales `uq_grade_session`/`uq_grade_course` y ninguna posterior los recreó. El *upsert* del cuaderno de notas fallaba, de modo que **recalificar estaba roto en toda instalación nueva**.
- **El rol `superadmin` no existía en el enum de la base**: `UserRole.superadmin` estaba en el código y todo el módulo de academias depende de él, pero ninguna migración añadió la etiqueta. En una instalación nueva **era imposible crear la cuenta que administra las academias**.

### Medio impacto — resueltos en esta revisión ✅
10. ~~Los cambios al catálogo no quedan auditados.~~ — **RESUELTO**: el catálogo completo audita create/update/delete.
11. ~~Reprogramar podía crear una doble reserva silenciosa.~~ — **RESUELTO**: la reprogramación compara ahora contra las **sesiones concretas** ya existentes en esa fecha (no sólo contra los patrones semanales), y rechaza fechas pasadas.
12. ~~Editar una sesión con `PATCH` no dejaba traza.~~ — **RESUELTO**: `update_session` audita igual que cancelar/reprogramar.
13. ~~El módulo de Finanzas no dejaba ninguna traza.~~ — **RESUELTO**: cobros, pagos y emisión de facturas quedan auditados con su autor.
14. ~~Los reportes mezclaban exámenes de todo el histórico.~~ — **RESUELTO**: las evaluaciones se filtran por el período del reporte (`Grade.created_at`).

### Revisión de julio 2026 (2ª pasada) — resueltos ✅

Cuatro incoherencias estructurales, encontradas contrastando el código contra este documento:

27. ~~**Los cinco estados de matrícula significaban cosas distintas según el módulo.**~~ — **RESUELTO**: el cupo contaba sólo *Activo*, el aula virtual admitía *Activo* e *Inscrito*, y la lista para pasar lista volvía a contar sólo *Activo*. Un alumno **Inscrito** entraba a clase y recibía tareas pero no salía en la lista, no ocupaba cupo, no disparaba validación de choque de horario y no recibía aviso de cancelación. Hoy las tres preguntas se responden en un solo sitio (`ENROLLMENT_OCCUPIES_SEAT` / `ENROLLMENT_HAS_ACCESS` / `ENROLLMENT_OWES`). Ver sección 6.
28. ~~**El cupo era evitable sin forzar nada.**~~ — **RESUELTO**: creando las matrículas como *Inscrito* se podía llenar un curso de 10 plazas sin límite, porque sólo se contaban las activas. Ahora cuenta cualquier matrícula que ocupe plaza, y la creación sólo admite estados de apertura.
29. ~~**El ciclo de vida no era un camino.**~~ — **RESUELTO**: un `PATCH` podía llevar una matrícula de *Desistió* de vuelta a *Activo*, o sacar de *Graduado* a alguien cuyo curso ya estaba cerrado. Ahora hay tabla de transiciones (409 `illegal_transition`) y el panel sólo ofrece los movimientos legales.
30. ~~**El rol `assistant` estaba a medio cablear.**~~ — **RESUELTO**: el menú ofrecía Aulas, Festivos, Horarios, Finanzas y editar usuarios, y la API respondía 403 a todo ello; Reportes devolvía un informe vacío sin explicar por qué; y `view_reports` no gateaba nada. Ver sección 2.
31. ~~**Ninguna sesión llegaba nunca a `held`.**~~ — **RESUELTO**: pasar lista marca la clase como realizada, y los reportes distinguen realizada / sin registrar / cancelada.
32. ~~**Crear una matrícula no dejaba traza.**~~ — **RESUELTO**. También se auditan ahora aulas, festivos, cualificaciones y disponibilidad de profesores.
33. ~~**Se podía pasar lista y calificar sobre sesiones canceladas y matrículas cerradas.**~~ — **RESUELTO** (409 en ambos casos).
34. ~~**Las ventanas de disponibilidad no se validaban entre sí.**~~ — **RESUELTO**: se rechazan las solapadas (409); las que se tocan en el extremo (09–13 y 13–17) siguen siendo dos turnos válidos.

### Revisión de agosto 2026 (3ª pasada) — resueltos ✅

Desfases de esquema encontrados al contrastar los modelos contra una base migrada (dev y test), y tres bugs de una línea:

35. ~~**`courses.periodicity` y las columnas de `tenants` no existían en la base.**~~ — **RESUELTO**: el modelo declaraba `Course.periodicity` y ocho columnas de `Tenant` (`timezone`, `currency`, `primary_color`, `secondary_color`, `custom_domain`, `tax_id`, `phone`, `address` + índice único de `custom_domain`) que ninguna migración había creado. Crear un curso o una academia crasheaba con `UndefinedColumn` en cualquier base ya migrada (24 errores en la batería de aislamiento). Migración `d4e5f6a7b8c9`; `alembic` queda con 0 desfases en dev y test.
36. ~~**Autogenerate podía volver a borrar los índices únicos de `grades`.**~~ — **RESUELTO (preventivo)**: los índices parciales `uq_grade_session`/`uq_grade_course` ahora están declarados en el modelo (`Index(..., postgresql_where=...)`), de modo que `alembic check` no los ve como deriva.
37. ~~**Auditar disponibilidad de profesor o borrar un horario daba 500.**~~ — **RESUELTO**: `_jsonable()` no serializaba `datetime.time`, y la disponibilidad y los horarios guardan horas. Ahora `time` se serializa con `isoformat()` como `date` y `datetime`.
38. ~~**Crear un festivo duplicado daba 500 en vez de 409.**~~ — **RESUELTO**: el `db.flush()` estaba fuera del `try/except IntegrityError`; el conflicto estalla en el flush y la excepción quedaba sin capturar.
39. ~~**Las propuestas de ubicación se veían y aprobaban entre academias.**~~ — **RESUELTO**: `GET /location-proposals` no filtraba por academia, y aprobar/rechazar buscaba la propuesta sólo por id. Un admin de una academia leía los enlaces y aulas propuestos en otra, y podía cambiar dónde se daban sus clases. Ahora el listado se acota por el curso del horario y aprobar/rechazar una ajena responde 404 (`test_location_proposals_are_per_academy`).
40. ~~**Suspender una academia no cortaba el acceso.**~~ — **RESUELTO**: la pantalla prometía «sin acceso hasta reactivar», pero su gente seguía iniciando sesión y usando la API; sólo el barrido de riesgo la saltaba. Ahora el login responde 403 con el motivo (después de comprobar la contraseña, para no revelar cuentas), y el refresco de sesión y cada petición responden 401, así que las sesiones abiertas también se cierran. El superadmin no pertenece a ninguna academia y no se ve afectado (`test_tenant_suspension.py`).

### Medio impacto — pendientes de confirmar con negocio
15. Un profesor recién creado, sin cualificaciones ni disponibilidad configuradas, puede ser asignado a cualquier curso y horario sin advertencia (postura "optimista" por diseño).
16. ~~Las alertas de "alumnos en riesgo" son manuales.~~ Resuelto: barrido semanal automático a profesores y administración.
17. ~~Borrar un **curso** arrastra en cascada matrículas y notas.~~ — **RESUELTO**: borrar un curso con matrículas responde 409; hay que vaciarlo antes. Borrar una **matrícula** sí sigue arrastrando su historial, pero la confirmación ahora lo dice y sugiere marcar *Desistió* en su lugar.
18. El principio "404 en vez de 403" no se aplica de forma uniforme en toda la API (sí lo hace, de forma consistente, para el aislamiento entre academias).
19. ~~Aulas, festivos, proveedores de video, tareas y notificaciones siguen sin auditarse.~~ — **PARCIAL**: aulas, festivos y disponibilidad ya se auditan. Siguen sin auditarse **proveedores de video, tareas y notificaciones**.

### Bajo impacto — matices para no generar expectativas equivocadas
20. ~~Las notificaciones son solo internas (in-app).~~ Resuelto: cola de envío por canal (`notification_deliveries`) escrita en la misma transacción, despachada cada 20 s con reintentos y caducidad a las 12 h.
21. ~~Verificar un certificado por código requiere sesión iniciada.~~ Descartado: Educa no emite certificados.
22. ~~La asistencia y las calificaciones pueden registrarse sobre matrículas o sesiones ya canceladas, sin bloqueo.~~ — **RESUELTO** (ver 33).

### Nuevo — pendiente de definición de negocio (requerimientos recién incorporados)
23. **Lista de nacionalidades**: la semilla actual reproduce el requerimiento original tal cual, que agrupaba países bajo "Centroamérica" sin que ninguno lo sea. Falta la lista real a ofrecer.
24. **Horarios de las jornadas Sabatino/Dominical (Matutina/Vespertina) y de la jornada Nocturna**: son valores por defecto razonables, no confirmados por negocio.
25. **Facturación es un comprobante interno**, no una factura con validez fiscal/electrónica. Si la operación real lo requiere, es trabajo adicional no cubierto todavía.
26. **Métodos de pago** (efectivo/tarjeta/transferencia/otro) y el **formato del correlativo** de matrícula y factura son convenciones del equipo, pendientes de confirmar con negocio.

---

*Documento actualizado — Educa v0.1.0 — Alineado y verificado contra el código fuente.*
