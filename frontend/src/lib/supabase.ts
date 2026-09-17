import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    }
  }
})

// Obtener access token de Supabase para llamar a tu backend
export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// Login con email/password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// Logout
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Registrar nuevo usuario (opcional)
export async function signUp(email: string, password: string, metadata?: Record<string, string>) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata }
  })
  if (error) throw error
  return data
}