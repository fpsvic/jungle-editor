# Jungle Editor Cloudflare deployment

The repository contains Cloudflare Pages Functions under `functions/`:

- `POST /api/publish` validates and stores public/private HTML, CSS, and JavaScript projects.
- `GET /api/project/:slug` returns a published project for the static editor shell.
- `POST /api/auth/signup` and `POST /api/auth/login` create email/password sessions.
- `GET /api/auth/google` starts Google OAuth when the Google secrets are configured.

## Pages setup

1. Create a Cloudflare Pages project from this repository.
2. Use the repository root as the build output directory and leave the build command empty.
3. Add three KV namespaces in the Pages project settings:
   - `JUNGLE_PROJECTS`
   - `JUNGLE_USERS`
   - `JUNGLE_SESSIONS`
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as encrypted variables if Google sign-in is wanted.
5. Add `jungle.net` and a wildcard `*.jungle.net` custom-domain route to the Pages project. The wildcard is what lets a published slug resolve as `slug.jungle.net`.

The free tier has usage limits, so the API deliberately caps hosted projects at 120 files, 300 KB per file, and 1 MB total. The client still falls back to a URL snapshot when it is running on the GitHub Pages deployment rather than the Cloudflare deployment.

Copy `wrangler.toml.example` to the repository root before using Wrangler; it shows the binding names without including account-specific IDs or secrets.
