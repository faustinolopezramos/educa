# Educa — Lógica de Negocio (para Product Owner)

> Este documento explica **cómo funciona el negocio hoy en el sistema**, en lenguaje de negocio, sin detalles técnicos. Al final hay una lista de **decisiones que te corresponden a ti** sobre comportamientos que el sistema ya tiene implementados de una manera específica, y que conviene confirmar si son los correctos antes de dar el sistema por terminado.
>
> (Existe también un documento técnico, `LOGICA_DE_NEGOCIO.md`, con el mismo contenido a nivel de detalle de implementación, pensado para el equipo de desarrollo.)
>
> **Actualización más reciente**: se agregaron datos de contacto y nacionalidad de alumnos y profesores, se amplió el catálogo a Competencias Digitales y de Negocios (además de Idiomas), la matrícula ahora tiene código propio y cuota, se sumó un módulo de Finanzas (cobros, pagos y facturas), horarios con jornadas predefinidas (Nocturna, Sabatino, Dominical) y una modalidad "Semi presencial". También se cerró el punto #12 de la lista de decisiones pendientes (revocar sesión al cambiar contraseña).

---

## 1. ¿Qué es Educa?

Educa es el sistema con el que una academia de idiomas y de competencias digitales/de negocios administra todo su día a día: qué cursos ofrece, quién los dicta, quién está inscrito, cómo se toma asistencia y se califica, cómo se entregan certificados, y cómo alumnos y profesores se conectan a las clases en línea.

Lo usan tres tipos de personas:

- **Administración**: organiza el catálogo de cursos, arma horarios, matricula alumnos, y tiene visibilidad total de la academia.
- **Profesores**: dan sus clases, pasan lista, califican, y proponen dónde se dicta cada clase (aula o link virtual).
- **Alumnos**: ven sus cursos, notas y asistencia, entran a la clase virtual, y descargan sus certificados.

Tanto alumnos como profesores pueden tener registrado su **teléfono, dirección y nacionalidad** (los tres son opcionales). La nacionalidad se elige de una lista que administración mantiene igual que el resto del catálogo — hoy trae de ejemplo la lista de países que llegó en el requerimiento original, agrupada bajo "Centroamérica" aunque en realidad ninguno de esos países lo es; falta que confirmes la lista real de países a ofrecer.

---

## 2. El catálogo de cursos

La oferta académica se organiza así:

```
Idioma o competencia (Inglés, Español, Computación básica, Marketing Digital...)
  └── Nivel o módulo (A1, A2, B1, B2, C1, C2...  ó  Módulo 1 a 4)
       └── Curso concreto (ej. "Inglés A1 - Trimestre 2026Q1")
```

Cada curso tiene fechas de inicio y fin, un cupo máximo de alumnos y una nota mínima para aprobar.

**La oferta ya no es solo idiomas.** El catálogo se organiza en tres grandes áreas, todas con la misma estructura de arriba:
- **Idiomas**: Inglés, Español (el "nivel" es la etapa A1 a C2)
- **Competencias Digitales**: Computación básica para adultos, Marketing Digital (el "nivel" es un módulo, del 1 al 4)
- **Competencias de Negocios**: Inteligencia Emocional, Emprendimiento (también por módulos)

En la pantalla de catálogo, administración ve la oferta agrupada en esas tres áreas.

**A tener en cuenta:** si se elimina un idioma o un nivel completo del catálogo, se eliminan automáticamente todos los cursos que dependían de él — y con ellos, las matrículas, notas y certificados de los alumnos que pasaron por esos cursos. No hay una pantalla intermedia de "esto tiene alumnos, ¿seguro?".

---

## 3. Profesores: quién puede dar qué clase

- Un profesor solo puede dar clases de un curso si **primero fue asignado** a ese curso.
- Si al profesor se le configuró qué idiomas puede enseñar, solo se le puede asignar a cursos de esos idiomas — el sistema **no deja** asignarlo a otro idioma.
- Si un profesor **nunca se configuró** con idiomas específicos, el sistema asume que puede enseñar cualquier idioma. Esto significa que un profesor recién dado de alta, sin ningún dato cargado todavía, puede terminar asignado a cualquier curso sin que nadie reciba una advertencia.
- Cada profesor puede tener un límite de horas por semana. El sistema lo respeta por semana (si un profesor da clases en dos trimestres que no se superponen en el calendario, esas horas no se suman entre sí).
- Los profesores pueden declarar en qué horarios están disponibles. Si no declaran nada, el sistema asume que están disponibles siempre.

---

## 4. Horarios y clases

- Un **horario** es la franja fija semanal de un curso (ej. "lunes y miércoles de 10 a 12").
- Una **clase** (o sesión) es la ocurrencia real de ese horario en una fecha puntual del calendario.

**El sistema impide, sin excepción:**
- Que un profesor tenga dos clases distintas al mismo tiempo.
- Que un aula física tenga dos clases distintas al mismo tiempo.
- Que un alumno quede matriculado en dos cursos cuyos horarios se superpongan.

**El sistema permite forzar (con autorización explícita de quien arma el horario), aunque avise:**
- Asignar una clase a un profesor sin verificar del todo su disponibilidad declarada.
- Exceder el tope de horas semanales de un profesor.

**Jornadas predefinidas:** al armar un horario, quien lo crea puede elegir una jornada ya definida en vez de escoger día y hora a mano: **Nocturna** (Lunes y Miércoles, o Martes y Jueves, de 18:00 a 20:00), **Plan Sabatino** (sábado, Matutina 08:00–12:00 o Vespertina 14:00–18:00) o **Plan Dominical** (domingo, mismas franjas). Elegir "Nocturna" crea las clases de los dos días de una sola vez. *Los horarios exactos de estas franjas son un punto de partida razonable, no confirmado todavía contigo.*

**Modalidad de la clase:** además de Presencial y Virtual, ahora existe **Semi presencial** (combina asistencia física y virtual); para efectos de reservar el aula, el sistema la trata igual que Presencial.

**Sobre generar las clases del trimestre:** no ocurre solo; alguien de administración (o el profesor) tiene que pedirle al sistema que genere todas las clases del período una vez creado el horario. El sistema evita generar clases en los días feriados configurados.

**Cancelar o mover una clase:**
- Se puede cancelar una clase puntual (con motivo opcional) o moverla a otra fecha.
- En ambos casos, los alumnos inscritos reciben un aviso en la campana de notificaciones y, si la academia lo tiene configurado, también **por correo** y **por WhatsApp** (ver sección 12).

---

## 5. Matrículas (inscripción de alumnos a cursos)

Al inscribir a un alumno en un curso, el sistema valida automáticamente:
- Que la persona sea efectivamente un alumno.
- Que no esté ya inscrito en ese mismo curso.
- Que el curso tenga cupo disponible.
- Que el horario del curso no choque con otro curso en el que ya esté inscrito.

Si hay un choque de horario, quien matricula puede decidir forzar la inscripción de todas formas.

Cada matrícula recibe automáticamente un **código correlativo** propio (por ejemplo `2026-00001`), que es el "Código/Carné" con el que se identifica la inscripción.

El estado de la matrícula tiene ahora **cinco** valores en vez de tres: **Inscrito**, **Activo**, **Inactivo**, **Certificado** (equivalente a "Graduado") y **Desistió** (antes "cancelada"). Este es, a propósito, el único "estatus" que existe para un alumno — no hay un estatus separado a nivel de persona, distinto del de sus matrículas.

Además del estado de pago (pendiente, pagado, vencido — mientras esté **vencido**, el alumno pierde acceso a ver sus notas y reportes), cada matrícula puede llevar una **cuota** y un registro de **cobros y pagos** (ver la sección de Finanzas más abajo). También existe un bloqueo disciplinario independiente que le impide al alumno abrir el detalle de una clase puntual.

### Finanzas: cuota, cobros, pagos y facturas

Cada matrícula puede tener una cuota acordada. A partir de ahí, el sistema lleva una cuenta de **cobros** (lo que se le debe a la academia) y **pagos** (lo que efectivamente se recibió, en efectivo, tarjeta, transferencia u otro medio); el saldo pendiente se calcula siempre a partir de esos movimientos. Administración puede, sobre esa cuenta, **emitir una factura**: un comprobante interno numerado y descargable en PDF por lo pagado hasta ese momento.

**A tener en cuenta:**
- La factura es un **comprobante interno**, no una factura con validez fiscal (no hay integración con ningún esquema de facturación electrónica). Si tu operación necesita eso, es un desarrollo aparte.
- Los métodos de pago disponibles (efectivo, tarjeta, transferencia, otro) y el formato de los números de matrícula/factura son un punto de partida razonable del equipo, no algo que hayas confirmado todavía.

---

## 6. Asistencia

El profesor marca, para cada alumno y cada clase, si estuvo presente, llegó tarde, faltó, o tuvo una falta justificada. Si se vuelve a marcar, la marca anterior se reemplaza (no se acumulan registros duplicados).

---

## 7. Calificaciones y aprobación

Hay dos tipos de nota:
- **Nota del día**: la participación de un alumno en una clase puntual.
- **Evaluaciones del curso**: exámenes, trabajos, nota final — no están atadas a una clase específica.

Las notas van de 0.0 a 10.0. La nota final del curso se calcula como un promedio ponderado de las evaluaciones (si no se configuró ningún peso especial, todas cuentan igual). El alumno aprueba si esa nota final llega o supera la nota mínima definida para el curso.

---

## 8. Certificados

- Solo se puede emitir un certificado si el alumno aprobó el curso.
- Por cada inscripción solo puede existir un certificado (no se pueden emitir duplicados).
- El certificado queda con un código único y se puede descargar en PDF.
- El certificado guarda la nota con la que se aprobó en el momento de emitirse: si más adelante se corrige esa nota, el certificado ya emitido no cambia.
- Verificar un certificado por su código **requiere tener una cuenta y sesión iniciada en el sistema** — hoy no es algo que un tercero externo (por ejemplo, un futuro empleador) pueda hacer sin ser usuario de la plataforma.

---

## 9. Dónde se dicta la clase (aula o link virtual)

- El profesor propone dónde va a dar la clase: un aula física, un enlace de videollamada, o una combinación de ambas (**Semi presencial**, que para efectos de reservar aula se maneja igual que Presencial).
- Administración aprueba o rechaza esa propuesta (si administración mismo la propone, queda aprobada automáticamente).
- Si es presencial o semi presencial, el sistema verifica que el aula no quede doblemente reservada.

---

## 10. Aula virtual

El alumno ve una cuenta regresiva y puede probar su cámara/micrófono 15 minutos antes de la clase; el botón para **entrar** se habilita recién a la hora exacta de inicio. El profesor no tiene esa espera: puede entrar en cualquier momento del día de la clase.

**Puntos a tener en cuenta:**
- Hoy se usa **el mismo enlace** tanto para el profesor como para los alumnos — no hay un enlace distinto "de anfitrión".
- La cuenta regresiva y la restricción de horario son solo visuales: un alumno inscrito que tenga el enlace puede acceder a él en cualquier momento, no solo durante la ventana de la clase.
- Existe una base ya construida para integrarse de forma más robusta con Zoom/Google Meet/Teams (con credenciales protegidas y un enlace distinto para el profesor), pero **todavía no está conectada a ninguna pantalla que usen alumnos o profesores** — hoy en día no aporta nada al flujo real.

---

## 11. Reportes

Los reportes (diarios, semanales o mensuales) muestran: clases dictadas vs. canceladas, porcentaje de asistencia, promedio de notas, y una lista de **alumnos en riesgo** (asistencia por debajo del 70% o promedio por debajo de 6.0).

**Puntos a tener en cuenta:**
- Una clase que todavía no ocurrió, pero cae dentro del período del reporte, ya se cuenta como "dictada".
- Cuando se reprograma una clase a otra fecha, el reporte la contabiliza igual que si se hubiera cancelado.
- El promedio de notas y el cálculo de "alumno en riesgo" **solo toman en cuenta la nota del día a día**, no los exámenes ni la nota final del curso. Un alumno con mal desempeño en el examen final, pero buena participación diaria, no aparecería como "en riesgo".

Administración ve reportes de toda la academia; cada profesor solo de sus cursos; cada alumno solo el suyo (si está al día con el pago).

---

## 12. Notificaciones

Hay una campana de notificaciones dentro de la aplicación. Avisa automáticamente cuando se cancela o reprograma una clase.

**Correo y WhatsApp.** Cada aviso de la campana sale también por correo (todos los avisos) y por WhatsApp (por ahora sólo clase cancelada o reprogramada), si la academia configuró esos canales:
- El **correo** viene activado para todos; cada persona puede apagarlo en su perfil.
- **WhatsApp** viene apagado: Meta exige que la persona lo haya aceptado. Lo activa el propio alumno en su perfil, o administración al editar su ficha si el consentimiento se recogió en la matrícula. Hace falta un teléfono registrado.
- Si un envío falla se reintenta durante aproximadamente una hora. Un aviso que no pudo salir en 12 horas se descarta en vez de mandarse tarde.
- Los mensajes de WhatsApp usan plantillas que Meta tiene que aprobar antes (el texto está en `DEPLOYMENT.md`). Además, un profesor o administración puede disparar manualmente un aviso de "alumnos en riesgo" — ese aviso llega a los **profesores** del curso, no directamente a los alumnos ni a un responsable de seguimiento académico, y no ocurre de forma automática ni periódica.

---

## 13. Quién puede ver y hacer qué (permisos)

| Acción | Administración | Profesor | Alumno |
|---|---|---|---|
| Gestionar usuarios, catálogo (incluye nacionalidades), horarios, matrículas, aulas | Sí | No | No |
| Registrar cobros/pagos y emitir facturas | Sí | No | No |
| Ver el horario completo de la academia | Sí | Sí | Solo sus propios cursos |
| Pasar lista / calificar | Sí | Solo sus cursos | No |
| Ver sus propias notas y asistencia | Sí | De sus cursos | Solo lo propio |
| Proponer dónde se da una clase | Sí (queda aprobado al instante) | Solo sus cursos | No |
| Aprobar o rechazar esa propuesta | Sí | No | No |
| Entrar al aula virtual | Sí | Sí | Sí |
| Ver reportes | Toda la academia | Sus cursos | Solo el propio, si está al día con el pago |
| Ver historial de auditoría (quién hizo qué) | Sí | No | No |
| Certificados | Emite | Puede verlos | Descarga el propio |

Además, ningún usuario puede cambiarse a sí mismo su propio rol, correo o tope de horas. Administración no puede eliminar su propia cuenta, y no se puede eliminar a un profesor que todavía tiene horarios asignados.

**Sobre el historial de auditoría**: hoy queda registro de quién hizo qué en asistencia, calificaciones, usuarios, matrículas y certificados. **No queda registro** de cambios en el catálogo (crear/editar/borrar un curso, nivel, idioma, o asignación de profesor), ni de quién cancela o reprograma una clase.

---

## 14. Decisiones pendientes para el Product Owner

Estos son comportamientos que **el sistema ya tiene implementados de una forma concreta** (no son errores técnicos, son decisiones de producto que hoy están tomadas por defecto). Te los señalo para que confirmes si son los que quieres, o si hay que cambiarlos antes de considerar el sistema listo.

### Prioridad alta

1. **Re-inscripción después de desistir.** Hoy, si un alumno desiste de un curso, **no puede volver a inscribirse a ese mismo curso nunca más** (aunque abra otra edición futura del mismo, sí podría). ¿Es el comportamiento deseado, o un alumno debería poder reinscribirse?

2. **Reactivar una matrícula.** Si se reactiva una inscripción que estaba en "Desistió", el sistema **no vuelve a revisar** si hay cupo disponible ni si hay choque de horario (esa revisión solo pasa la primera vez que se inscribe). ¿Debería revisarse de nuevo al reactivar?

3. **Reprogramar una clase SÍ revisa choques reales de horario.** Al mover una clase a otra fecha, el sistema verifica: disponibilidad del profesor, otros horarios semanales del profesor que caen ese día, disponibilidad del aula, y sesiones concretas ya existentes en esa fecha/hora (protegido además por constraint de exclusión GiST en `ClassSession`). ✅ **Resuelto**

4. **Acceso al enlace de la clase virtual.** Hoy cualquier alumno inscrito puede acceder al enlace de la clase en cualquier momento (no solo durante el horario de clase), y es el mismo enlace tanto para el profesor como para los alumnos. ¿Es necesario restringir el acceso a la ventana horaria de la clase, y/o tener un enlace distinto para el profesor?

5. **Integración real con Zoom/Meet/Teams.** Existe una base construida para conectarse directamente con esos proveedores (con enlaces separados y credenciales protegidas), pero no está en uso — hoy el profesor simplemente pega un enlace manualmente. ¿Se planea usar esa integración en esta fase, o el enlace manual es suficiente por ahora? (Afecta si vale la pena terminarla o dejarla de lado.)

6. **Criterio de "alumno en riesgo".** Hoy solo mira la nota de participación diaria, no exámenes ni la nota final. ¿Debería incluir también esas notas para reflejar mejor el desempeño real del alumno?

7. **Trazabilidad de cancelaciones y reprogramaciones.** Ambas operaciones quedan registradas en la auditoría (`entity=class_session`, actions `cancel` y `reschedule`) con actor, timestamp y before/after. ✅ **Resuelto**

### Prioridad media

8. **Trazabilidad de cambios al catálogo.** No queda registro de quién crea, edita o elimina un curso, nivel, idioma o asignación de profesor. ¿Es necesario para fines de control interno?

9. **Profesores nuevos sin configuración.** Un profesor recién dado de alta, sin idiomas ni disponibilidad cargada, puede ser asignado a cualquier curso y horario sin ninguna advertencia. ¿Es el comportamiento deseado, o debería exigirse configurar al profesor antes de asignarlo?

10. **Alertas de alumnos en riesgo.** Hoy son manuales (alguien tiene que disparar la acción) y avisan al profesor, no al alumno ni a un responsable de seguimiento. ¿Debería ser automático y/o llegar a otras personas?

11. **Eliminar un idioma o nivel con cursos activos.** Hoy se borra todo en cadena (cursos, matrículas, notas, certificados) sin una confirmación adicional. ¿Debería impedirse o requerir una confirmación explícita si tiene alumnos asociados?

12. ~~Cierre de sesión al cambiar contraseña o dar de baja a un usuario.~~ **Resuelto parcialmente**: cambiar la contraseña ahora sí cierra automáticamente cualquier sesión abierta en otros dispositivos. Dar de baja a un usuario **todavía no** lo hace — sigue teniendo acceso hasta que expire su sesión, hasta por un mes. ¿Quieres que dar de baja a un usuario también cierre sus sesiones activas de inmediato?

### Prioridad baja (matices, no necesariamente requieren cambio)

13. ~~Notificaciones solo dentro de la app.~~ **Resuelto**: los avisos salen también por correo y WhatsApp (sección 12). Queda por decidir si los avisos de alumnos en riesgo deben ir también por WhatsApp — hoy sólo van por campana y correo.

14. **Verificación de certificados.** Requiere tener cuenta en el sistema; alguien externo (ej. un empleador) no puede verificar un certificado sin ser usuario. ¿Debería habilitarse una verificación pública?

15. **Asistencia y notas sobre clases o matrículas ya canceladas/desistidas.** El sistema hoy permite pasar lista o calificar aunque la clase o la matrícula ya estén en ese estado. ¿Debería bloquearse?

### Nuevas — de los requerimientos recién incorporados

16. **Lista real de nacionalidades.** La lista cargada hoy es la que llegó en el requerimiento original, agrupada bajo "Centroamérica" sin que ninguno de esos países lo sea. ¿Cuál es la lista real que quieres ofrecer (por ejemplo, agregar Guatemala y el resto de Centroamérica)?
17. **Horarios exactos de las jornadas.** Nocturna (18:00–20:00) y las franjas Matutina/Vespertina de Sabatino y Dominical (08:00–12:00 / 14:00–18:00) son un punto de partida razonable, no un dato que hayas confirmado. ¿Son las franjas correctas?
18. **Alcance de la facturación.** Hoy es un comprobante interno sin validez fiscal. ¿Necesitas facturación con validez fiscal/electrónica para esta fase, o el comprobante interno es suficiente por ahora?
19. **Métodos de pago y formato de correlativos.** Los métodos de pago (efectivo/tarjeta/transferencia/otro) y el formato de los códigos de matrícula y factura son una propuesta del equipo. ¿Los confirmas o prefieres otros?

---

*Documento de negocio para Product Owner — Educa v0.1.0 (Fase 1).*
