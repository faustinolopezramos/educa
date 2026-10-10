import { Link } from "react-router-dom";

import { Bullets, LegalLayout, Section } from "../../legal/LegalLayout";
import { LEGAL } from "../../legal/legalInfo";
import { PLAN_CATALOG, formatQuetzales } from "../../lib/plans";

export default function TermsOfService() {
  const paid = [PLAN_CATALOG.starter, PLAN_CATALOG.pro, PLAN_CATALOG.scale];
  return (
    <LegalLayout
      title="Términos y Condiciones"
      summary={
        <p>
          <strong>En pocas palabras:</strong> {LEGAL.product} es una herramienta para que tu
          academia gestione cursos, alumnos, asistencia, notas y pagos. Empiezas gratis con hasta
          15 alumnos; los planes de pago se activan al confirmar el pago. Los datos de tu academia
          son tuyos y tú decides sobre ellos. {LEGAL.product} no emite títulos ni facturas
          fiscales.
        </p>
      }
    >
      <Section id="objeto" title="1. Qué regulan estos términos">
        <p>
          Estos Términos y Condiciones regulan el uso de {LEGAL.product}, plataforma de gestión
          académica operada por {LEGAL.owner} (NIT {LEGAL.taxId}), con domicilio en{" "}
          {LEGAL.address}. Al crear una academia, quien la registra acepta estos términos en
          nombre de esa academia y declara que tiene autoridad para hacerlo. Quien entra con una
          cuenta que le dio de alta su academia también debe respetarlos.
        </p>
        <p>
          El tratamiento de datos personales se rige además por la{" "}
          <Link to="/privacidad" className="font-medium text-brand-700 underline">
            Política de Privacidad
          </Link>
          , que forma parte de estos términos.
        </p>
      </Section>

      <Section id="definiciones" title="2. Definiciones">
        <Bullets>
          <li>
            <strong>Academia:</strong> la institución que crea una cuenta en {LEGAL.product} para
            gestionar su actividad.
          </li>
          <li>
            <strong>Administrador o director:</strong> la persona que administra la cuenta de la
            Academia.
          </li>
          <li>
            <strong>Usuario:</strong> toda persona que entra en {LEGAL.product}: administradores,
            asistentes, profesores y alumnos.
          </li>
          <li>
            <strong>Datos de la Academia:</strong> la información que la Academia y sus usuarios
            registran en {LEGAL.product}.
          </li>
        </Bullets>
      </Section>

      <Section id="cuentas" title="3. Cuentas y acceso">
        <Bullets>
          <li>
            La Academia da de alta a sus usuarios y responde de que los datos que registra sean
            veraces y de que tiene derecho a registrarlos.
          </li>
          <li>
            Cada usuario debe guardar en secreto su contraseña y avisar a su academia si sospecha
            que alguien más la usa. Las cuentas son personales.
          </li>
          <li>
            Si se entra con Google, Microsoft o Apple, sólo se accede a una cuenta que la Academia
            ya dio de alta con el mismo correo.
          </li>
          <li>
            Si en la Academia hay alumnos menores de edad, la Academia debe contar con la
            autorización de sus padres o tutores antes de darlos de alta.
          </li>
        </Bullets>
      </Section>

      <Section id="planes" title="4. Planes, precios y pagos">
        <p>
          Toda Academia empieza en el <strong>plan Gratis</strong>, que admite hasta{" "}
          {PLAN_CATALOG.free.maxStudents} alumnos activos sin costo y sin plazo. Los planes de pago
          vigentes son:
        </p>
        <Bullets>
          {paid.map((p) => (
            <li key={p.code}>
              <strong>{p.name}:</strong> hasta {p.maxStudents.toLocaleString("en-US")} alumnos
              activos, {formatQuetzales(p.monthlyPrice)} al mes.
            </li>
          ))}
        </Bullets>
        <Bullets>
          <li>
            Un alumno activo es una persona con al menos una matrícula vigente; un alumno en dos
            cursos cuenta una vez.
          </li>
          <li>
            La Academia solicita un plan de pago desde su panel. El plan se activa cuando{" "}
            {LEGAL.product} confirma el pago; hasta entonces sigue en el plan que tenga.
          </li>
          <li>
            Al llegar al límite de su plan, la Academia no puede matricular a más alumnos hasta
            pasar a un plan mayor. Nunca se borran datos por llegar al límite.
          </li>
          <li>
            Los precios se expresan en quetzales e incluyen los impuestos que correspondan según
            la ley guatemalteca, salvo que se indique otra cosa. Cualquier cambio de precio se
            avisará con al menos {LEGAL.noticeDays} días de antelación y se aplicará a partir del
            siguiente período.
          </li>
          <li>
            Si un plan de pago no se paga, {LEGAL.product} puede devolver la Academia al plan
            Gratis o suspender el servicio, previo aviso.
          </li>
        </Bullets>
      </Section>

      <Section id="cobros-academia" title="5. Lo que la Academia cobra a sus alumnos">
        <p>
          {LEGAL.product} ayuda a la Academia a llevar el registro de las cuotas, pagos y saldos
          de sus alumnos, en la moneda que la Academia elija. {LEGAL.product} no cobra ni recibe
          ese dinero, no interviene en la relación económica entre la Academia y sus alumnos y no
          cobra comisión sobre ella.
        </p>
        <p>
          Los comprobantes que genera {LEGAL.product} son <strong>comprobantes internos</strong>{" "}
          de la Academia: no son facturas ni documentos tributarios electrónicos (DTE). La
          Academia es responsable de cumplir sus propias obligaciones fiscales.
        </p>
        <p>
          {LEGAL.product} tampoco emite certificados, diplomas ni títulos: la certificación de
          los estudios corresponde a la Academia.
        </p>
      </Section>

      <Section id="datos" title="6. Los datos de la Academia">
        <Bullets>
          <li>
            Los Datos de la Academia pertenecen a la Academia. {LEGAL.product} sólo los usa para
            prestarle el servicio, de acuerdo con la Política de Privacidad.
          </li>
          <li>
            Respecto de los datos personales de sus alumnos, profesores y personal, la Academia es
            la responsable y {LEGAL.product} actúa por su cuenta y siguiendo sus instrucciones.
            La Academia se encarga de informar a esas personas y, cuando corresponda, de obtener
            su consentimiento.
          </li>
          <li>
            Al terminar el servicio, la Academia puede pedir una copia de sus datos durante los{" "}
            {LEGAL.retentionAfterCancelDays} días siguientes; después se eliminan.
          </li>
        </Bullets>
      </Section>

      <Section id="uso" title="7. Uso aceptable">
        <p>No está permitido:</p>
        <Bullets>
          <li>Usar {LEGAL.product} para fines ilegales o para dañar a terceros.</li>
          <li>Intentar acceder a cuentas o datos de otras academias o de otras personas.</li>
          <li>
            Probar, sobrecargar o vulnerar la seguridad del servicio sin autorización escrita.
          </li>
          <li>Registrar datos de personas sin tener derecho a hacerlo.</li>
          <li>Revender o sublicenciar el servicio sin autorización.</li>
        </Bullets>
      </Section>

      <Section id="terceros" title="8. Servicios de terceros">
        <p>
          {LEGAL.product} se conecta con servicios de terceros, como Zoom, Google Meet, Microsoft
          Teams, WhatsApp o el inicio de sesión de Google, Microsoft y Apple. Su uso se rige por
          los términos de cada uno, y {LEGAL.product} no responde de su disponibilidad ni de su
          funcionamiento.
        </p>
      </Section>

      <Section id="disponibilidad" title="9. Disponibilidad y cambios del servicio">
        <p>
          Trabajamos para que {LEGAL.product} esté disponible y funcione correctamente, pero no
          podemos garantizar que el servicio no tenga interrupciones o errores. Podemos mejorar,
          cambiar o retirar funciones; si un cambio afecta de forma importante a lo que la Academia
          contrató, lo avisaremos con antelación.
        </p>
      </Section>

      <Section id="suspension" title="10. Suspensión y terminación">
        <Bullets>
          <li>La Academia puede dejar de usar {LEGAL.product} cuando quiera.</li>
          <li>
            {LEGAL.product} puede suspender una cuenta por falta de pago, por incumplir estos
            términos o por un riesgo de seguridad, avisando antes salvo que la urgencia no lo
            permita. Una cuenta suspendida conserva sus datos.
          </li>
        </Bullets>
      </Section>

      <Section id="propiedad" title="11. Propiedad intelectual">
        <p>
          El software, el diseño y la marca {LEGAL.product} pertenecen a {LEGAL.owner}. Mientras
          la Academia tenga una cuenta, puede usar el servicio para su actividad; estos términos no
          le transfieren ningún otro derecho sobre él.
        </p>
      </Section>

      <Section id="responsabilidad" title="12. Responsabilidad">
        <p>
          En la medida que la ley lo permita, {LEGAL.product} no responde de daños indirectos ni
          de lucro cesante, y su responsabilidad total frente a una Academia se limita al importe
          que ésta haya pagado por el servicio en los doce meses anteriores al hecho. Nada de lo
          anterior limita la responsabilidad que la ley no permita limitar.
        </p>
        <p>
          La Academia responde de los datos que registra y del uso que ella y sus usuarios hagan
          del servicio.
        </p>
      </Section>

      <Section id="cambios" title="13. Cambios en estos términos">
        <p>
          Si cambiamos estos términos de forma importante, lo avisaremos con al menos{" "}
          {LEGAL.noticeDays} días de antelación. Seguir usando {LEGAL.product} después de esa
          fecha supone aceptar los nuevos términos.
        </p>
      </Section>

      <Section id="ley" title="14. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por las leyes de la República de Guatemala. Cualquier
          controversia se someterá a los tribunales competentes de {LEGAL.jurisdictionCity},
          salvo que la ley disponga otra cosa.
        </p>
      </Section>

      <Section id="contacto" title="15. Contacto">
        <p>
          Soporte: {LEGAL.supportEmail} · Privacidad: {LEGAL.privacyEmail}
          <br />
          {LEGAL.owner} · {LEGAL.address}
        </p>
      </Section>
    </LegalLayout>
  );
}
