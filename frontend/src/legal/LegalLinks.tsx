import { Link } from "react-router-dom";

/** Los tres documentos legales, para pies de página y pantallas de acceso. */
export function LegalLinks({
  className = "",
  linkClassName = "hover:text-slate-700",
}: {
  className?: string;
  linkClassName?: string;
}) {
  return (
    <nav aria-label="Documentos legales" className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${className}`}>
      <Link to="/terminos" className={linkClassName}>
        Términos y Condiciones
      </Link>
      <Link to="/privacidad" className={linkClassName}>
        Política de Privacidad
      </Link>
      <Link to="/cookies" className={linkClassName}>
        Política de Cookies
      </Link>
    </nav>
  );
}
