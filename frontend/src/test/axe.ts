import axe from "axe-core";

/**
 * Pasa axe-core por un trozo de DOM y devuelve las violaciones que importan.
 *
 * jsdom no calcula estilos ni maquetación, así que `color-contrast` no se puede
 * medir aquí (se revisa a mano / en navegador) y se excluye; lo demás —nombres
 * accesibles, etiquetas de formulario, roles ARIA válidos, ids duplicados,
 * estructura de encabezados— sí.
 */
export async function accessibilityViolations(root: Element): Promise<string[]> {
  const result = await axe.run(root, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
}
