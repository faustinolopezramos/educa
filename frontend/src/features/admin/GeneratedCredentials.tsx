import { useState } from "react";

/**
 * Las credenciales de una cuenta recién creada, para entregárselas a la persona.
 *
 * La contraseña la generó el servidor y sólo viaja en la respuesta del alta: si
 * se cierra esta vista sin copiarla, hay que asignar otra desde "Editar".
 */
export function GeneratedCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña: ${password}`);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles el texto sigue a la vista para copiarlo a mano.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Entrega estos datos a la persona. La contraseña no se volverá a mostrar; podrá
        cambiarla desde su perfil.
      </p>
      <dl className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Usuario</dt>
          <dd className="truncate font-medium text-slate-900">{email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Contraseña</dt>
          <dd className="font-mono font-semibold text-slate-900 select-all">{password}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={copy}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {copied ? "✓ Copiado" : "Copiar usuario y contraseña"}
      </button>
    </div>
  );
}
