/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_OPEN_METEO_FORECAST_URL?: string
  readonly VITE_OPEN_METEO_ARCHIVE_URL?: string
  readonly VITE_OPEN_METEO_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
