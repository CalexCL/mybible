window.MYBIBLE_CONFIG = Object.freeze({
  version: '0.2.1-pages-supabase-configured',
  deployment: 'github-pages',
  publicPath: './',
  scripture: {
    cuvs: {
      enabled: true,
      localDataUrl: 'data/cuvs_local.json',
      remoteBookTemplate: 'https://raw.githubusercontent.com/midvash/bible-data/main/versions/zh/cuvs/books/{osis}.json'
    },
    nkjv: {
      enabled: false,
      dataUrl: null,
      reason: 'NKJV full-text public redistribution is disabled until the project has an approved electronic distribution licence or licensed API.'
    }
  },
  backend: {
    // Credentials are recorded below, but cloud sync stays disabled until Auth UI is enabled.
    // This prevents accidental write failures and keeps the current localStorage experience working.
    provider: 'local',
    supabase: {
      configured: true,
      enabled: false,
      url: 'https://ongvhjmriytpkmthaide.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZ3Zoam1yaXl0cGttdGhhaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MDgwOTEsImV4cCI6MjEwNDI4NDA5MX0.DbvHZ849KjwNtbvCfQRZsbTbkkXh9oWolF_FE1-odV4',
      schema: 'public'
    }
  }
});
