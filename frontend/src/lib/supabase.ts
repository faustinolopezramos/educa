import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Si la academia usa Supabase Auth. Cuando no está configurado, el login propio
 * de Educa funciona igual y aquí no se toca nada.
 *
 * No hay valores por defecto a propósito: con una URL y una clave inventadas el
 * cliente se creaba igualmente y los fallos aparecían mucho más tarde, como
 * errores de red sin explicación, en vez de al arrancar.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * La sesión de Supabase sólo sirve para una cosa: obtener un token que el
 * backend canjea por una sesión de Educa. A partir de ahí manda el JWT propio.
 *
 * Por eso no se persiste ni se renueva sola. Cuando se guardaba, convivían dos
 * sesiones con vidas distintas y el interceptor acababa mandando a la API el
 * token de Supabase, que ésta no acepta: cada petición daba 401 y cerraba la
 * sesión del usuario.
 */
/**
 * El cliente se carga bajo demanda, la primera vez que hace falta: la librería
 * pesa bastante y antes viajaba en el paquete inicial de toda la aplicación,
 * aunque sólo la usa el inicio de sesión y sólo si Supabase está configurado.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

function getSupabase(): Promise<SupabaseClient> | null {
  if (!isSupabaseConfigured) return null;
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
  return clientPromise;
}

/** Inicia sesión en Supabase y devuelve su access token, para canjearlo. */
export async function signInWithSupabase(
  email: string,
  password: string,
): Promise<string> {
  const pending = getSupabase();
  if (!pending) throw new Error("Supabase no está configurado");
  const supabase = await pending;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Supabase no devolvió una sesión");
  return token;
}

/** Cierra la sesión de Supabase. Nunca bloquea el cierre de sesión local. */
export async function signOutFromSupabase(): Promise<void> {
  const pending = getSupabase();
  if (!pending) return;
  try {
    const supabase = await pending;
    await supabase.auth.signOut();
  } catch {
    // La sesión local ya se limpió; esto es sólo aseo del lado de Supabase.
  }
}

/** Envía correo de restablecimiento de contraseña mediante Supabase si está configurado. */
export async function sendPasswordResetEmail(email: string, redirectTo?: string): Promise<void> {
  const pending = getSupabase();
  if (!pending) throw new Error("Supabase no está configurado");
  const supabase = await pending;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo ?? (typeof window !== "undefined" ? `${window.location.origin}/recuperar-clave` : undefined),
  });
  if (error) throw error;
}

/** Actualiza la contraseña en Supabase durante una sesión de recuperación. */
export async function updateSupabasePassword(newPassword: string): Promise<void> {
  const pending = getSupabase();
  if (!pending) throw new Error("Supabase no está configurado");
  const supabase = await pending;
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---------------- Entrar con Google, Microsoft o Apple ----------------

/** Los proveedores que entiende Supabase. "azure" es Microsoft (Outlook, Office 365). */
export type OAuthProvider =
  | "google"
  | "azure"
  | "apple"
  | "github"
  | "gitlab"
  | "slack"
  | "bitbucket"
  | "discord"
  | "facebook"
  | "twitter";

const KNOWN_PROVIDERS: OAuthProvider[] = [
  "google",
  "azure",
  "apple",
  "github",
  "gitlab",
  "slack",
  "bitbucket",
  "discord",
  "facebook",
  "twitter",
];

/**
 * Los proveedores activos en esta instalación, de `VITE_AUTH_PROVIDERS`
 * ("google,azure,apple"). Por defecto activa Google y Microsoft/Outlook si
 * Supabase está configurado.
 */
export const OAUTH_PROVIDERS: OAuthProvider[] = isSupabaseConfigured
  ? (import.meta.env.VITE_AUTH_PROVIDERS ?? "")
      .split(",")
      .map((p: string) => p.trim().toLowerCase())
      .filter((p: string): p is OAuthProvider => KNOWN_PROVIDERS.includes(p as OAuthProvider))
  : [];

/** Detecta si un dominio de correo pertenece a un proveedor conocido. */
export function detectEmailProvider(email: string): OAuthProvider | null {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith("@gmail.com") || normalized.endsWith("@googlemail.com")) {
    return "google";
  }
  if (
    normalized.endsWith("@outlook.com") ||
    normalized.endsWith("@hotmail.com") ||
    normalized.endsWith("@live.com") ||
    normalized.endsWith("@msn.com") ||
    normalized.endsWith("@microsoft.com")
  ) {
    return "azure";
  }
  // GitHub, GitLab, etc. usan dominios propios, no emails de usuario
  return null;
}

/** La academia elegida antes de salir hacia el proveedor, para el canje al volver. */
const TENANT_KEY = "educa-oauth-tenant";
/** Adónde iba la persona antes de que le pidieran iniciar sesión. */
const RETURN_KEY = "educa-oauth-return";

/**
 * Un cliente aparte para el viaje de ida y vuelta al proveedor.
 *
 * El flujo PKCE guarda un verificador antes de salir y lo necesita al volver.
 * El cliente principal no persiste nada (ver arriba), así que ese verificador
 * se perdería en la redirección. Éste lo guarda en `sessionStorage` —sólo esta
 * pestaña, sólo hasta cerrarla— y se limpia en cuanto la sesión se canjea.
 */
let oauthClientPromise: Promise<SupabaseClient> | null = null;

function getOAuthClient(): Promise<SupabaseClient> {
  oauthClientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        storage: window.sessionStorage,
        storageKey: "educa-oauth",
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
  );
  return oauthClientPromise;
}

/** Sale hacia el proveedor. La página vuelve a `/auth/callback`. */
export async function startProviderLogin(
  provider: OAuthProvider,
  options: { tenantSlug?: string; returnTo?: string; loginHint?: string } = {},
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase no está configurado");
  try {
    if (options.tenantSlug) sessionStorage.setItem(TENANT_KEY, options.tenantSlug);
    else sessionStorage.removeItem(TENANT_KEY);
    if (options.returnTo) sessionStorage.setItem(RETURN_KEY, options.returnTo);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Sin sessionStorage se pierde sólo la comodidad de volver a la misma página.
  }
  const client = await getOAuthClient();
  const queryParams: Record<string, string> = {};
  if (options.loginHint) {
    queryParams.login_hint = options.loginHint;
  }
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Microsoft no envía el correo si no se pide expresamente.
      scopes: provider === "azure" ? "email" : undefined,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
    },
  });
  if (error) throw error;
}

/** Envía un enlace mágico (Magic Link) al correo para entrar sin contraseña. */
export async function sendMagicLink(
  email: string,
  options: { tenantSlug?: string; returnTo?: string } = {},
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase no está configurado");
  try {
    if (options.tenantSlug) sessionStorage.setItem(TENANT_KEY, options.tenantSlug);
    else sessionStorage.removeItem(TENANT_KEY);
    if (options.returnTo) sessionStorage.setItem(RETURN_KEY, options.returnTo);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Sin sessionStorage se pierde sólo la comodidad de volver a la misma página.
  }
  const client = await getOAuthClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
}

/** Al volver: canjea el `code` del proveedor o token directo por el token de Supabase. */
export async function finishProviderLogin(
  code?: string,
  options: { accessToken?: string } = {},
): Promise<{
  supabaseToken: string;
  tenantSlug?: string;
  returnTo?: string;
}> {
  let token = options.accessToken;
  if (!token) {
    if (!code) throw new Error("No se proporcionó código ni token de sesión");
    const client = await getOAuthClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    token = data.session?.access_token;
  }
  if (!token) throw new Error("Supabase no devolvió una sesión");
  let tenantSlug: string | undefined;
  let returnTo: string | undefined;
  try {
    tenantSlug = sessionStorage.getItem(TENANT_KEY) ?? undefined;
    returnTo = sessionStorage.getItem(RETURN_KEY) ?? undefined;
  } catch {
    // Igual que arriba: sin almacenamiento no hay preferencia guardada.
  }
  return { supabaseToken: token, tenantSlug, returnTo };
}

/** Tras el canje con el backend: se borra todo rastro de la sesión de Supabase. */
export async function clearProviderSession(): Promise<void> {
  try {
    sessionStorage.removeItem(TENANT_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    const client = await getOAuthClient();
    await client.auth.signOut({ scope: "local" });
  } catch {
    // La sesión de EDUCA ya es la que manda; esto es sólo limpieza.
  }
}
