import { Link } from "react-router-dom";

import { Bullets, LegalLayout, Section } from "../../legal/LegalLayout";
import { LEGAL } from "../../legal/legalInfo";

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Política de Privacidad"
      summary={
        <>
          <p>
            <strong>En pocas palabras:</strong> cada academia decide qué datos de sus alumnos y
            profesores guarda en {LEGAL.product}, y nosotros los tratamos sólo para prestarle el
            servicio. No vendemos datos, no mostramos publicidad y no usamos cookies ni
            herramientas de seguimiento. Si eres alumno o profesor y quieres consultar, corregir o
            borrar tus datos, pídeselo a tu academia; si lo prefieres, escríbenos a{" "}
            {LEGAL.privacyEmail}.
          </p>
        </>
      }
    >
      <Section id="responsable" title="1. Quién es responsable de tus datos">
        <p>
          {LEGAL.product} es una plataforma de gestión académica operada por {LEGAL.owner} (NIT{" "}
          {LEGAL.taxId}), con domicilio en {LEGAL.address} («{LEGAL.product}», «nosotros»).
          Según de quién sean los datos, actuamos en uno de dos papeles:
        </p>
        <Bullets>
          <li>
            <strong>Como responsables</strong>, de los datos de las academias que contratan el
            servicio y de quienes las administran: datos de contacto, plan contratado y su
            facturación, y la información que nos envían para pedir soporte.
          </li>
          <li>
            <strong>Como encargados, por cuenta de cada academia</strong>, de los datos que la
            academia registra sobre sus alumnos, profesores y personal. La academia es la
            responsable de esos datos: decide para qué se usan, a quién da de alta y cuánto tiempo
            los conserva. Nosotros sólo los tratamos siguiendo sus instrucciones y para prestarle
            el servicio.
          </li>
        </Bullets>
      </Section>

      <Section id="datos" title="2. Qué datos tratamos">
        <p>Según cómo uses {LEGAL.product}, tratamos estos datos:</p>
        <Bullets>
          <li>
            <strong>Datos de la cuenta:</strong> nombre, correo electrónico, teléfono, dirección,
            documento de identificación (DPI/CUI, pasaporte u otro), nacionalidad, zona horaria,
            rol en la academia y preferencias de avisos. Las contraseñas se guardan cifradas de
            forma irreversible: nadie, ni siquiera nosotros, puede leerlas.
          </li>
          <li>
            <strong>Datos académicos:</strong> cursos, horarios, matrículas, asistencia, notas,
            tareas y lo que se entrega en ellas (texto o enlaces), solicitudes de recuperación y
            renovación, y alertas de rendimiento.
          </li>
          <li>
            <strong>Datos económicos:</strong> cuotas, pagos y saldos de cada matrícula,
            comprobantes internos y, para los profesores, la tarifa por hora y la nómina
            calculada. {LEGAL.product} no procesa pagos con tarjeta ni guarda datos bancarios.
          </li>
          <li>
            <strong>Datos de la academia:</strong> nombre, identificador, teléfono, dirección, NIT,
            moneda, zona horaria y plan contratado.
          </li>
          <li>
            <strong>Inicio de sesión con Google, Microsoft o Apple:</strong> si lo usas,
            recibimos de ese proveedor tu correo, tu nombre y un identificador de cuenta, sólo
            para comprobar quién eres. No accedemos a tu correo, tus archivos ni tus contactos.
          </li>
          <li>
            <strong>Datos técnicos y de seguridad:</strong> la dirección IP de los intentos de
            inicio de sesión (para frenar ataques), las sesiones abiertas y un registro de
            auditoría de los cambios importantes (quién cambió una nota, un pago o un usuario, y
            cuándo).
          </li>
          <li>
            <strong>Avisos:</strong> si activas los avisos en el navegador, guardamos la
            dirección técnica que tu navegador nos da para enviártelos.
          </li>
        </Bullets>
        <p>
          La prueba de cámara y micrófono antes de una clase virtual se hace sólo en tu
          dispositivo: la imagen y el sonido no se envían ni se graban. Las clases virtuales se
          realizan en Zoom, Google Meet o Microsoft Teams, que tratan esos datos según sus propias
          políticas.
        </p>
      </Section>

      <Section id="finalidades" title="3. Para qué los usamos">
        <Bullets>
          <li>
            <strong>Prestar el servicio</strong> que la academia contrató: gestionar cursos,
            horarios, matrículas, asistencia, notas, pagos, reportes y clases virtuales. Es la
            razón por la que existen los datos y se basa en el contrato con la academia.
          </li>
          <li>
            <strong>Enviar avisos</strong> sobre la actividad académica (una clase cancelada, un
            alumno en riesgo, un cambio de plan) por la aplicación, por correo o por WhatsApp. El
            correo puede desactivarse desde el perfil; WhatsApp sólo se usa si la persona lo
            aceptó.
          </li>
          <li>
            <strong>Proteger las cuentas y el servicio:</strong> limitar intentos de acceso,
            detectar el uso de sesiones robadas y registrar quién hizo cada cambio.
          </li>
          <li>
            <strong>Gestionar la relación con la academia:</strong> su plan, los avisos de cupo y
            el soporte.
          </li>
          <li>
            <strong>Cumplir obligaciones legales</strong> y atender requerimientos de autoridades
            competentes.
          </li>
        </Bullets>
        <p>
          No usamos los datos para publicidad, no los vendemos y no tomamos decisiones
          automatizadas con efectos legales sobre las personas. Las alertas de alumnos en riesgo
          son avisos para que la academia decida, no decisiones.
        </p>
      </Section>

      <Section id="menores" title="4. Alumnos menores de edad">
        <p>
          Las academias pueden registrar a alumnos menores de edad. En ese caso es la academia,
          como responsable, quien debe contar con la autorización de sus padres o tutores antes de
          darlos de alta y quien atiende sus solicitudes. {LEGAL.product} no recoge datos de
          menores por su cuenta ni fuera del servicio que presta a la academia.
        </p>
      </Section>

      <Section id="acceso" title="5. Quién puede ver los datos">
        <p>Dentro de cada academia, cada persona ve sólo lo que su papel necesita:</p>
        <Bullets>
          <li>La dirección y el personal autorizado ven los datos de su propia academia.</li>
          <li>
            Los profesores ven a los alumnos de sus cursos para dar clase, pasar lista y
            calificar, pero no sus cuotas, saldos ni pagos.
          </li>
          <li>Cada alumno ve sus propios datos, notas y estado de cuenta.</li>
          <li>Ninguna academia puede ver los datos de otra.</li>
        </Bullets>
        <p>Fuera de la academia, compartimos datos sólo con:</p>
        <Bullets>
          <li>
            <strong>Proveedores que nos ayudan a prestar el servicio</strong> (apartado 6), que
            sólo pueden usarlos para eso.
          </li>
          <li>
            <strong>Autoridades</strong>, cuando una ley o una orden judicial nos obligue.
          </li>
        </Bullets>
      </Section>

      <Section id="proveedores" title="6. Proveedores y transferencias internacionales">
        <p>
          Para funcionar, {LEGAL.product} usa estos proveedores. Algunos están fuera de{" "}
          {LEGAL.country}, principalmente en los Estados Unidos, por lo que los datos se
          transfieren a esos países. Elegimos proveedores que ofrecen garantías de seguridad y
          confidencialidad adecuadas.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-slate-500">
                <th className="py-2 pr-3 font-semibold">Proveedor</th>
                <th className="py-2 pr-3 font-semibold">Para qué</th>
                <th className="py-2 font-semibold">Dónde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <tr>
                <td className="py-2 pr-3">Supabase</td>
                <td className="py-2 pr-3">Base de datos e inicio de sesión</td>
                <td className="py-2">Estados Unidos u otra región elegida</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Fly.io</td>
                <td className="py-2 pr-3">Servidores de la aplicación</td>
                <td className="py-2">Estados Unidos</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Vercel</td>
                <td className="py-2 pr-3">Publicación del sitio web</td>
                <td className="py-2">Red global</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Proveedor de correo electrónico</td>
                <td className="py-2 pr-3">Envío de avisos por correo</td>
                <td className="py-2">Según el proveedor contratado</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Meta (WhatsApp Business)</td>
                <td className="py-2 pr-3">Avisos por WhatsApp, si se activan</td>
                <td className="py-2">Estados Unidos y otros</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Servicios de avisos del navegador (Google, Apple, Mozilla)</td>
                <td className="py-2 pr-3">Avisos push, si se activan</td>
                <td className="py-2">Estados Unidos y otros</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Google, Microsoft, Apple</td>
                <td className="py-2 pr-3">Inicio de sesión con su cuenta, si se usa</td>
                <td className="py-2">Estados Unidos y otros</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="conservacion" title="7. Cuánto tiempo los conservamos">
        <Bullets>
          <li>
            Mientras la academia tenga su cuenta activa, conservamos sus datos para prestarle el
            servicio. Dar de baja a una persona la desactiva pero mantiene su historial académico
            (notas y asistencia), porque la academia lo necesita para sus registros.
          </li>
          <li>
            Si la academia cancela el servicio, conservamos sus datos {LEGAL.retentionAfterCancelDays}{" "}
            días para que pueda pedir una copia, y después los eliminamos, salvo lo que una ley
            nos obligue a guardar.
          </li>
          <li>
            Las sesiones cerradas se borran a los 30 días, y los avisos que no pudieron enviarse
            se descartan a las 12 horas.
          </li>
          <li>
            El registro de auditoría se conserva mientras exista la academia, porque es lo que
            permite explicar después un cambio de nota o de pago.
          </li>
        </Bullets>
      </Section>

      <Section id="seguridad" title="8. Cómo los protegemos">
        <Bullets>
          <li>Toda la comunicación viaja cifrada (HTTPS).</li>
          <li>Las contraseñas se guardan con un cifrado irreversible (bcrypt).</li>
          <li>
            Las credenciales de los servicios de videoconferencia se guardan cifradas.
          </li>
          <li>
            Cada consulta se limita a la academia de quien la hace y a lo que su papel le permite.
          </li>
          <li>
            Las sesiones caducan y se renuevan de forma segura; cambiar la contraseña cierra las
            demás sesiones.
          </li>
          <li>Los cambios importantes quedan en un registro de auditoría.</li>
        </Bullets>
        <p>
          Ningún sistema es infalible. Si detectamos un incidente de seguridad que afecte a tus
          datos, avisaremos a la academia afectada sin demora indebida para que pueda informar a
          las personas involucradas.
        </p>
      </Section>

      <Section id="derechos" title="9. Tus derechos">
        <p>
          Puedes pedir <strong>acceder</strong> a tus datos, <strong>corregirlos</strong>,{" "}
          <strong>eliminarlos</strong> u <strong>oponerte</strong> a un tratamiento, así como
          retirar un consentimiento que hayas dado (por ejemplo, el de recibir avisos por
          WhatsApp).
        </p>
        <Bullets>
          <li>
            <strong>Si eres alumno, profesor o personal de una academia</strong>, dirígete a tu
            academia, que es la responsable de tus datos. Muchos datos puedes corregirlos tú mismo
            desde tu perfil. Si nos escribes a nosotros, trasladaremos tu solicitud a tu academia y
            la ayudaremos a responderla.
          </li>
          <li>
            <strong>Si administras una academia</strong>, escríbenos a {LEGAL.privacyEmail}.
          </li>
        </Bullets>
        <p>
          Responderemos en un plazo máximo de {LEGAL.rightsResponseDays} días. Podemos pedirte que
          acredites tu identidad antes de atender la solicitud.
        </p>
      </Section>

      <Section id="cookies" title="10. Cookies">
        <p>
          {LEGAL.product} no usa cookies de publicidad ni de seguimiento. Lo que guardamos en tu
          navegador para que la aplicación funcione se explica en la{" "}
          <Link to="/cookies" className="font-medium text-brand-700 underline">
            Política de Cookies
          </Link>
          .
        </p>
      </Section>

      <Section id="cambios" title="11. Cambios en esta política">
        <p>
          Si cambiamos esta política de forma importante, lo avisaremos a las academias con al
          menos {LEGAL.noticeDays} días de antelación por correo o dentro de la aplicación. La
          fecha y la versión vigentes figuran al inicio de este documento.
        </p>
      </Section>

      <Section id="contacto" title="12. Contacto">
        <p>
          Para cualquier consulta sobre privacidad: {LEGAL.privacyEmail}
          <br />
          {LEGAL.owner} · {LEGAL.address}
        </p>
      </Section>
    </LegalLayout>
  );
}
