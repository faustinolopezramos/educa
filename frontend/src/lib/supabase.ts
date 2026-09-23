import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Inicia sesión en Supabase y devuelve su access token, para canjearlo. */
export async function signInWithSupabase(
  email: string,
  password: string,
): Promise<string> {
  if (!supabase) throw new Error("Supabase no está configurado");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Supabase no devolvió una sesión");
  return token;
}

/** Cierra la sesión de Supabase. Nunca bloquea el cierre de sesión local. */
export async function signOutFromSupabase(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // La sesión local ya se limpió; esto es sólo aseo del lado de Supabase.
  }
}
