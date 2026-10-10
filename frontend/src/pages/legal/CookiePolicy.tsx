import { Link } from "react-router-dom";

import { Bullets, LegalLayout, Section } from "../../legal/LegalLayout";
import { LEGAL } from "../../legal/legalInfo";

/**
 * Lo que EDUCA guarda en el navegador. Tiene que coincidir con el código: si
 * se añade una clave nueva a localStorage o sessionStorage, va aquí.
 */
const STORAGE: { name: string; where: string; purpose: string; duration: string }[] = [
  {
    name: "educa_token, educa_refresh_token",
    where: "Almacenamiento local",
    purpose: "Mantener tu sesión abierta de forma segura.",
    duration: "Hasta que cierras sesión; la sesión caduca a los 7 días sin uso.",
  },
  {
    name: "educa:attendance-queue:…",
    where: "Almacenamiento local",
    purpose:
      "Guardar las marcas de asistencia que un profesor toma sin conexión, para enviarlas al volver la conexión.",
    duration: "Hasta que se envían; como máximo 12 horas.",
  },
  {
    name: "educa_nav_collapsed",
    where: "Almacenamiento local",
    purpose: "Recordar si plegaste el menú lateral.",
    duration: "Hasta que lo borres.",
  },
  {
    name: "educa_av_ok",
    where: "Almacenamiento de sesión",
    purpose: "Recordar que ya probaste cámara y micrófono antes de una clase.",
    duration: "Hasta cerrar la pestaña.",
  },
  {
    name: "educa-oauth…",
    where: "Almacenamiento de sesión",
    purpose:
      "Completar el inicio de sesión con Google, Microsoft o Apple (academia elegida y página a la que volver).",
    duration: "Se borra al terminar de entrar, o al cerrar la pestaña.",
  },
];

export default function CookiePolicy() {
  return (
    <LegalLayout
      title="Política de Cookies"
      summary={
        <p>
          <strong>En pocas palabras:</strong> {LEGAL.product} no usa cookies. Tampoco usamos
          herramientas de analítica, publicidad ni seguimiento, y no cargamos contenido de
          terceros al navegar por el sitio. Sólo guardamos en tu navegador lo imprescindible para
          que la aplicación funcione, y por eso no te pedimos consentimiento.
        </p>
      }
    >
      <Section id="que-son" title="1. Qué son las cookies y el almacenamiento local">
        <p>
          Las cookies son pequeños archivos que un sitio guarda en tu navegador. El
          almacenamiento local y el de sesión son mecanismos parecidos: permiten a una aplicación
          recordar información en tu dispositivo. A diferencia de las cookies, no se envían
          solos en cada visita.
        </p>
      </Section>

      <Section id="que-usamos" title="2. Qué guardamos en tu navegador">
        <p>
          {LEGAL.product} no instala cookies. Usa el almacenamiento del navegador sólo para lo
          estrictamente necesario:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-slate-500">
                <th className="py-2 pr-3 font-semibold">Nombre</th>
                <th className="py-2 pr-3 font-semibold">Dónde</th>
                <th className="py-2 pr-3 font-semibold">Para qué</th>
                <th className="py-2 font-semibold">Cuánto dura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {STORAGE.map((s) => (
                <tr key={s.name}>
                  <td className="py-2 pr-3 font-mono">{s.name}</td>
                  <td className="py-2 pr-3">{s.where}</td>
                  <td className="py-2 pr-3">{s.purpose}</td>
                  <td className="py-2">{s.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Si activas los avisos del navegador, éste registra además un pequeño programa
          («service worker») que sólo sirve para mostrarte esos avisos. Puedes desactivarlos
          desde tu perfil o desde la configuración del navegador.
        </p>
      </Section>

      <Section id="terceros" title="3. Terceros">
        <p>
          Navegar por {LEGAL.product} no carga contenido de terceros: hasta las fuentes
          tipográficas se sirven desde nuestro propio sitio. Sólo interviene un tercero cuando tú
          lo eliges:
        </p>
        <Bullets>
          <li>
            Al <strong>iniciar sesión con Google, Microsoft o Apple</strong>, pasas por su página,
            que usa sus propias cookies según su política.
          </li>
          <li>
            Al <strong>entrar a una clase virtual</strong>, abres Zoom, Google Meet o Microsoft
            Teams, que aplican las suyas.
          </li>
        </Bullets>
      </Section>

      <Section id="control" title="4. Cómo borrar estos datos">
        <p>
          Al cerrar sesión se borran los datos de tu sesión. También puedes borrar todo lo que{" "}
          {LEGAL.product} guarda desde la configuración de tu navegador («Borrar datos de
          navegación» o «Datos de sitios»). Si lo haces, tendrás que volver a iniciar sesión, y
          se perderán las marcas de asistencia que no se hubieran enviado.
        </p>
      </Section>

      <Section id="cambios" title="5. Cambios en esta política">
        <p>
          Si en el futuro usáramos cookies o herramientas que no sean imprescindibles, lo
          explicaremos aquí y te pediremos tu consentimiento antes de activarlas. Para más
          información sobre cómo tratamos tus datos, consulta la{" "}
          <Link to="/privacidad" className="font-medium text-brand-700 underline">
            Política de Privacidad
          </Link>{" "}
          o escríbenos a {LEGAL.privacyEmail}.
        </p>
      </Section>
    </LegalLayout>
  );
}
