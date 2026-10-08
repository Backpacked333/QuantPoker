/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL; online play is off when unset. */
  readonly VITE_SUPABASE_URL?: string
  /** Publishable (sb_publishable_…) or legacy anon key. Browser-safe. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
