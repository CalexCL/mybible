# GitHub Pages deployment

Target repository: `CalexCL/mybible`

This folder is ready to be the repository root.

## GitHub Pages

A Pages workflow is included at `.github/workflows/pages.yml`. After the files are on `main`:

1. Open **Settings → Pages** in the repository.
2. Under **Build and deployment**, choose **GitHub Actions** if GitHub has not selected it automatically.
3. Open **Actions** and confirm **Deploy MyBible to GitHub Pages** succeeds.
4. The expected project-site URL is `https://calexcl.github.io/mybible/`.

The application uses relative paths, so it works correctly under the `/mybible/` project path.

## Important: NKJV public deployment

The complete NKJV JSON from the private prototype is intentionally **not included** in this public GitHub Pages package. The NKJV buttons remain part of the product architecture but are disabled until the project has either:

- permission/licensing for electronic public redistribution, or
- an approved licensed API/data source.

Do not commit the private `data/nkjv.json` file to this public repository unless that permission has been resolved.

## Supabase later

The current personal study layer uses local browser storage. `backend.js` exposes an adapter boundary, and `supabase/schema.sql` contains the first cloud schema with Row Level Security. See `supabase/README.md`.

## Supabase configuration status

Supabase project URL + browser anon key are recorded in `config.js`. Cloud sync is not activated yet because user authentication must be enabled first. The current build continues to use localStorage safely until that step is completed.
