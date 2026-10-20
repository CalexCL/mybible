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
    kjv: {
      enabled: true,
      remoteBookTemplate: 'https://raw.githubusercontent.com/midvash/bible-data/main/versions/en/kjv/books/{osis}.json',
      attribution: 'King James Version (1769); source: midvash/bible-data (public-domain designation, see SOURCES.md)'
    },
    nkjv: {
      enabled: false,
      dataUrl: null,
      reason: 'NKJV full-text public redistribution is disabled until the project has an approved electronic distribution licence or licensed API.'
    }
  },
  backend: {
    // Guests remain local-only; signed-in readers synchronize their own study data.
    // Only a public browser anon/publishable key is used, with user-scoped RLS.
    provider: 'supabase',
    supabase: {
      configured: true,
      enabled: true,
      url: 'https://ongvhjmriytpkmthaide.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uZ3Zoam1yaXl0cGttdGhhaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MDgwOTEsImV4cCI6MjEwNDI4NDA5MX0.DbvHZ849KjwNtbvCfQRZsbTbkkXh9oWolF_FE1-odV4',
      schema: 'public'
    }
  }
});
