# Manual de Usuario y Documentación Operativa — EDUCA

> **Versión del Sistema:** 2.0 (Edición Multi-Tenant B2B SaaS)  
> **Audiencia:** Directores y Administradores, Profesores y Alumnos.  
> **Propósito:** Guía de referencia rápida y paso a paso para operar, enseñar y aprender en la plataforma EDUCA sin fricción.

---

## Índice General

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Módulo 1: Manual del Director / Administrador](#2-módulo-1-manual-del-director--administrador)
   - [2.1 Configuración Inicial en 15 Minutos (Setup Wizard)](#21-configuración-inicial-en-15-minutos-setup-wizard)
   - [2.2 Estructura Académica (Áreas, Niveles y Cursos)](#22-estructura-académica-áreas-niveles-y-cursos)
   - [2.3 Gestión del Cuerpo Docente y Nómina](#23-gestión-del-cuerpo-docente-y-nómina)
   - [2.4 Importación Masiva de Alumnos (CSV / Excel)](#24-importación-masiva-de-alumnos-csv--excel)
   - [2.5 Matrículas y Control Financiero (Cobros y Solvencia)](#25-matrículas-y-control-financiero-cobros-y-solvencia)
   - [2.6 Supervisión en Tiempo Real y Alertas de Ausencia](#26-supervisión-en-tiempo-real-y-alertas-de-ausencia)
3. [Módulo 2: Manual del Profesor](#3-módulo-2-manual-del-profesor)
   - [3.1 Acceso y Agenda Semanal](#31-acceso-y-agenda-semanal)
   - [3.2 Modo Clase: Pase de Lista Ultra Rápido (Online / Offline)](#32-modo-clase-pase-de-lista-ultra-rápido-online--offline)
   - [3.3 Creación de Tareas con Fechas Preconfiguradas](#33-creación-de-tareas-con-fechas-preconfiguradas)
   - [3.4 SpeedGrader: Calificación con Atajos de Teclado](#34-speedgrader-calificación-con-atajos-de-teclado)
4. [Módulo 3: Manual del Alumno](#4-módulo-3-manual-del-alumno)
   - [4.1 Ingreso sin Instalaciones Pesadas](#41-ingreso-sin-instalaciones-pesadas)
   - [4.2 El Lobby Virtual: Acceso a Clases y Prueba de Cámara](#42-el-lobby-virtual-acceso-a-clases-y-prueba-de-cámara)
   - [4.3 Entrega de Tareas Anti-Ansiedad (Recibo Digital)](#43-entrega-de-tareas-anti-ansiedad-recibo-digital)
   - [4.4 Consulta de Calificaciones y Progreso](#44-consulta-de-calificaciones-y-progreso)
5. [Guía de Resolución de Incidencias Frecuentes (FAQ Operativo)](#5-guía-de-resolución-de-incidencias-frecuentes-faq-operativo)

---

## 1. Visión General del Sistema

EDUCA es una plataforma web integral diseñada bajo el principio de **cero ruido visual y máxima eficiencia operativa**.

* **Aislamiento Multi-Tenant:** Cada academia cuenta con su propio subdominio (`miacademia.educa.com`), base de datos aislada y personalización institucional.
* **Roles del Sistema:**
  * 👔 **Director / Administrador:** Administra catálogo, profesores, matrículas, cobros, nómina y supervisión global.
  * 👩‍🏫 **Profesor:** Gestiona sus clases activas, toma asistencia, crea asignaciones y califica con SpeedGrader.
  * 🎓 **Alumno:** Visualiza su agenda, asiste a clases virtuales y entrega tareas con confirmación inmutable.
  * 🛡️ **Asistente Académico:** Rol administrativo con permisos delegados (matrículas, catálogo o caja).

---

## 2. Módulo 1: Manual del Director / Administrador

### 2.1 Configuración Inicial en 15 Minutos (Setup Wizard)

Al registrar tu academia en `/crear-academia`, serás recibido por el **Asistente de Puesta en Marcha** en tu pantalla de inicio:

* Paso 1: Crea un área o idioma (o presiona el atajo de plantilla).
* Paso 2: Define sus niveles académicos.
* Paso 3: Da de alta a tus profesores y asigna su tarifa por hora.
* Paso 4: Crea un curso con horario y profesor asignado.
* Paso 5: Abre el curso a matrícula (esto genera las clases en el calendario).
* Paso 6: Carga tus alumnos (en 1 clic vía CSV/Excel).
* Paso 7: Matricula al primer alumno.

> **💡 Consejo Pro:** En los pasos 1 y 2, presiona el botón **`⚡ Cargar Inglés (A1 a B2)`** o **`💻 Cargar Habilidades Digitales`**. El sistema creará automáticamente el área académica y 4 niveles calibrados en menos de 1 segundo.

### 2.2 Estructura Académica (Áreas, Niveles y Cursos)

1. **Áreas Académicas (`Catálogo`):** Representan las disciplinas que enseña tu academia (ej. *Inglés*, *Diseño Gráfico*, *Robótica*).
2. **Niveles:** Los peldaños de avance de cada área (ej. *A1, A2, B1, B2* o *Módulo 1, 2, 3*).
3. **Cursos:** La instancia activa con fecha de inicio, profesor asignado, cupo máximo de alumnos y horario semanal.
   - Estado **Borrador (Draft):** Para armar horarios y asignar docentes sin que sea visible para los alumnos.
   - Estado **Abierto (Open):** Abre inscripciones y genera automáticamente las sesiones en el calendario.

### 2.3 Gestión del Cuerpo Docente y Nómina

* **Dar de alta a un profesor:**
  1. Ve a la pestaña **`Docentes`** $\rightarrow$ **`+ Nuevo Profesor`**.
  2. Ingresa su nombre, correo institucional y **tarifa por hora (`hourly_rate`)**.
  3. Asigna las materias/idiomas que está facultado para impartir.
* **Cálculo Automático de Nómina:**
  * Al final del mes, el sistema multiplica las horas de clase **efectivamente impartidas** (registradas con asistencia) por la tarifa horaria del docente, generando el reporte de liquidación en 1 clic.

### 2.4 Importación Masiva de Alumnos (CSV / Excel)

Para cargar a tus alumnos sin introducirlos uno a uno:

1. Ve a la sección **`Alumnos`** $\rightarrow$ Pulsa **`📥 Importar CSV / Excel`**.
2. **Descarga la plantilla oficial:** Haz clic en *`📄 Descargar plantilla CSV`*.
3. **Completa los datos en Excel o Google Sheets:**
   * `email` *(Obligatorio)*: Correo del alumno.
   * `full_name` *(Obligatorio)*: Nombre y apellido.
   * `document_id` *(Opcional)*: DNI, CUI o pasaporte.
   * `phone` *(Opcional)*: Teléfono o WhatsApp de contacto.
4. **Arrastra el archivo:** Sube el `.csv` al cuadro de carga.
5. **Auto-Matriculación Opcional:** Si deseas que todo el grupo quede inscrito a un curso específico desde el inicio, selecciónalo en el menú desplegable.
6. Pulsa **`Comenzar Importación`**: El sistema procesará las filas, creará las cuentas con contraseña segura y te entregará un informe inmediato de filas creadas y omitidas.

### 2.5 Matrículas y Control Financiero (Cobros y Solvencia)

* **Matricular a un estudiante:**
  * Ingresa a **`Matrículas`** $\rightarrow$ **`Nueva Matrícula`**.
  * Selecciona el alumno y el curso. El sistema valida automáticamente que no se exceda el cupo del aula ni el límite contratado de tu academia (`max_active_students`).
* **Estados de Cuenta del Alumno:**
  * **Al día (Paid):** Acceso libre a clases, tareas y notas.
  * **Pendiente (Pending):** Período de gracia para abonar la colegiatura.
  * **En Mora (Overdue):** El sistema **restringe automáticamente la visualización de calificaciones** hasta que se registre el abono en administración.

### 2.6 Supervisión en Tiempo Real y Alertas de Ausencia

En el panel de **`Inicio`**, la Dirección cuenta con semáforos automáticos:
* **Tasa de asistencia global:** Porcentaje de presencia en la semana.
* **Alertas de Deserción Temprana:** Notifica cuando un estudiante acumula 2 o más faltas consecutivas para permitir una llamada de retención antes de que abandone la academia.

---

## 3. Módulo 2: Manual del Profesor

### 3.1 Acceso y Agenda Semanal

Al ingresar a EDUCA, el profesor visualiza su **agenda del día**:
* Horario exacto de cada clase.
* Modalidad (Presencial con aula física asignada o Virtual con enlace sincrónico).
* Acceso directo al botón **`Iniciar Clase`**.

### 3.2 Modo Clase: Pase de Lista Ultra Rápido (Online / Offline)

Al hacer clic en **`Modo Clase`**, la pantalla se simplifica para eliminar distracciones:

1. **Roster de Estudiantes:** Aparece la lista de inscritos con botones táctiles de 1 toque:
   * 🟢 **Presente (P)**
   * 🟡 **Tardanza (T)**
   * 🔴 **Ausente (A)**
   * 🔵 **Justificado (J)**
2. **Modo Rápido:** Presiona el botón *"Marcar todos presentes"* y ajusta únicamente a los ausentes.
3. **Resiliencia Offline:** Si la conexión a internet del aula parpadea, la asistencia se almacena localmente en el dispositivo y se sincroniza automáticamente al restablecerse la red.

### 3.3 Creación de Tareas con Fechas Preconfiguradas

En la pestaña **`Tareas`**, pulsa **`+ Nueva Tarea`**:
* **Título y Descripción:** Instrucciones claras en texto enriquecido.
* **Puntaje Máximo:** Por defecto 100 puntos (configurable).
* **Presets de Vencimiento en 1 Clic:**
  * `⚡ En 3 días`: Ideal para ejercicios cortos.
  * `📅 Fin de semana`: Vence el domingo a las 23:59.
  * `🗓️ En 7 días`: Plazo estándar semanal.
  * `Personalizado`: Selección manual de día y hora.

### 3.4 SpeedGrader: Calificación con Atajos de Teclado

Diseñado para que calificar 30 tareas tome menos de 10 minutos:

* **Atajos de teclado:**
  * Presiona `Ctrl + Enter` (o `Cmd + Enter` en Mac) para guardar la nota y avanzar automáticamente al siguiente estudiante.
  * Usa las flechas $\leftarrow$ y $\rightarrow$ para navegar entre alumnos.
* **Chips de Feedback Rápido:** Clic en etiquetas frecuentes como *"¡Excelente trabajo!"*, *"Revisar ortografía"* o *"Buen análisis"* para no reescribir lo mismo 30 veces.

---

## 4. Módulo 3: Manual del Alumno

### 4.1 Ingreso sin Instalaciones Pesadas

1. Abre el navegador web en tu celular, tablet o computadora (Chrome, Safari, Edge, Firefox).
2. Ingresa a la dirección de tu academia (ej. `tuacademia.educa.com` o `/login`).
3. Digita tu correo y tu contraseña entregada por la administración.

### 4.2 El Lobby Virtual: Acceso a Clases y Prueba de Cámara

15 minutos antes de la hora de inicio de tu clase, verás activo el botón **`Entrar a Clase`**:
* **Prueba de hardware:** El Lobby te permite verificar tu cámara y micrófono antes de conectarte.
* **Enlace directo protegido:** Un solo clic te conecta con el aula de Zoom, Google Meet o Teams del profesor, sin enlaces perdidos en chats de WhatsApp.

### 4.3 Entrega de Tareas Anti-Ansiedad (Recibo Digital)

Para entregar un trabajo asignado:

1. Ve a la pestaña **`Tareas`** $\rightarrow$ Ubica la tarea pendiente.
2. Pulsa **`Entregar Tarea`**:
   * **Opción Archivo:** Arrastra tu documento (`PDF`, `DOCX`, `ZIP`, `JPG`).
   * **Opción Nube:** Pega tu enlace de Google Drive, Notion o Figma.
   * **Opción Texto:** Escribe tu respuesta directamente en el editor.
3. Presiona **`Confirmar y Enviar Trabajo`**.
4. **Comprobante Digital Inmutable:** Aparecerá de inmediato una tarjeta verde con el folio del recibo (ej. `#ED-2026-9812`) y la marca de tiempo exacta de entrega. Puedes guardar este número ante cualquier duda académica.

### 4.4 Consulta de Calificaciones y Progreso

* En **`Mis Calificaciones`**, verás tus notas actualizadas en tiempo real en cuanto el docente califica.
* Podrás leer los comentarios y retroalimentación personalizada de tu profesor.

---

## 5. Guía de Resolución de Incidencias Frecuentes (FAQ Operativo)

| Situación | Causa Común | Solución Inmediata |
| :--- | :--- | :--- |
| **El alumno dice que no puede ver sus calificaciones.** | La mensualidad del alumno está en estado `overdue` (mora). | El Director o Administrador debe ingresar a `Finanzas` / `Matrículas` y registrar el pago correspondiente. Las notas se desbloquean al instante. |
| **El profesor no ve su clase en el horario.** | El curso aún está en estado `Borrador` o no tiene aula/horario asignado. | En `Catálogo` $\rightarrow$ `Cursos`, cambiar el estado del curso a `Abierto` (`Open`). |
| **Error al importar archivo CSV de alumnos.** | El archivo contiene cabeceras no reconocidas o correos duplicados. | Descargar nuevamente la plantilla modelo desde el modal de importación y asegurarse de que cada alumno tenga un correo único. |
| **No se escucha el audio en el Lobby virtual.** | El navegador no tiene permisos de micrófono habilitados. | Hacer clic en el candado junto a la URL del navegador y permitir el acceso al micrófono y cámara. |
| **El alumno necesita entregar una tarea fuera de plazo.** | La fecha de vencimiento ya expiró. | El alumno puede entregar marcando la casilla de entrega tardía si el profesor lo habilitó, o el profesor puede ajustar la fecha de la tarea en 2 clics. |
| **Se alcanzó el cupo máximo de estudiantes.** | La academia llegó al límite de su plan contratado (`max_active_students`). | En el panel de superadministrador o planes, ampliar el cupo al siguiente nivel (ej. de 100 a 300 alumnos). |

---

> **Soporte Oficial de EDUCA:** Para asistencia técnica adicional o dudas sobre integraciones API, contactar a `soporte@educa.com` o a través del canal oficial de WhatsApp de tu plan.
