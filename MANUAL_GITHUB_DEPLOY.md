# MyBible — Manual GitHub Deployment

Target repository: `https://github.com/CalexCL/mybible`

## First deployment from Windows

1. Install **Git for Windows** if it is not already installed.
2. Extract the MyBible ZIP to a normal folder (do not run it from inside the ZIP preview).
3. Double-click **`DEPLOY_TO_GITHUB.bat`**.
4. If the script asks for Git name/email, enter the identity you want shown on commits.
5. When GitHub authentication opens, sign in with **CalexCL**.
6. Wait until the script says the push succeeded.

## Enable GitHub Pages once

Open the repository and go to:

`Settings > Pages > Build and deployment > Source > GitHub Actions`

Then open **Actions** and wait for the workflow named:

`Deploy MyBible to GitHub Pages`

Expected public URL:

`https://calexcl.github.io/mybible/`

## Supabase

The Supabase project URL and browser anon key are already recorded in `config.js`.
Cloud sync is intentionally still disabled (`provider: 'local'`, `enabled: false`) until authentication and RLS are enabled.

Before enabling cloud writes, run `supabase/schema.sql` in the Supabase SQL editor and then enable the authentication UI.

## Important

- Never commit a Supabase `service_role` or secret key.
- The current browser anon key is designed to be public, but security still depends on Row Level Security (RLS).
- NKJV full-text public redistribution remains disabled pending licensing/authorized API access.
