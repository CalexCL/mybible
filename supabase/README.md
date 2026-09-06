# Supabase readiness

The public GitHub Pages build uses browser `localStorage` by default. The app already talks to a small storage-adapter interface so the personal layer can later move to Supabase without rewriting the Bible reader.

## Planned cloud data

- Notes
- Bookmarks
- Highlights
- Later: prayer journal, reading progress, study collections, settings and signed-in profiles

## To enable later

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Add the official Supabase browser client to `index.html`.
4. Add your **project URL** and **anon/publishable key** in `config.js`.
5. Set `backend.provider` to `supabase` and `backend.supabase.enabled` to `true`.
6. Add authentication UI (email magic link, OAuth, etc.).

Never publish a service-role key in GitHub Pages or any browser code. Row Level Security in `schema.sql` ensures signed-in users can only access their own personal study records.

## Project configuration recorded (2026-09-07)

The GitHub Pages client configuration now contains the supplied Supabase project URL and legacy `anon` key in `config.js`.

Cloud sync is intentionally **not enabled yet**. `backend.provider` remains `local` and `backend.supabase.enabled` remains `false` until the authentication UI is implemented and the SQL schema/RLS policies have been applied.

The supplied key is a legacy browser `anon` key. Supabase is migrating browser apps toward the newer `sb_publishable_...` key format, so replace it with a publishable key when convenient. Never put a `service_role` or `sb_secret_...` key in this repository or any GitHub Pages JavaScript.
