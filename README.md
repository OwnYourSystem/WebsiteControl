# WordPress Page Publisher (local script)

Creates a **new page** on a WordPress site from your own machine via the WordPress
REST API. No cloud intermediary, no browser CORS issues — your credentials stay
local.

Requires **Node.js 18+** (uses the built-in `fetch`). No `npm install` needed.

---

## 1. Get an Application Password

1. Log in to `https://ownyoursystem.com/wp-admin` as an admin.
2. Go to **Users → Profile** (`/wp-admin/profile.php`).
3. Scroll to **Application Passwords**.
4. Enter a name (e.g. "Page Publisher") and click **Add New Application Password**.
5. Copy the generated password. It looks like `abcd EFGH 1234 wxyz 5678 IJKL`.
   - Spaces are fine — the script strips them for you.

> **Important:** An Application Password authenticates as a specific user via
> **HTTP Basic Auth** (`username:password`), so you also need your WordPress
> **username** — not just the password. (This is why the old "API key only" form
> could never have worked.)

---

## 2. Configure credentials

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Then edit `.env`:

```
WP_SITE_URL=https://ownyoursystem.com
WP_USERNAME=your-wp-username
WP_APP_PASSWORD=abcd EFGH 1234 wxyz 5678 IJKL
```

`.env` is gitignored, so it won't be committed.

Load it into your shell before running. On macOS/Linux:

```bash
set -a; source .env; set +a
```

On Windows PowerShell:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) }
}
```

(Or just export `WP_SITE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD` manually.)

---

## 3. Publish a page

Always test with `--dry-run` first — it prints exactly what would be sent without
calling the API:

```bash
node publish-page.mjs --title "My New Page" --content "<p>Hello world</p>" --dry-run
```

Create it as a **draft** (the default — safe):

```bash
node publish-page.mjs --title "My New Page" --content "<p>Hello world</p>"
```

Publish it live:

```bash
node publish-page.mjs --title "My New Page" --file ./content.html --status publish
```

Pipe content from stdin:

```bash
echo "<p>Hi</p>" | node publish-page.mjs --title "My New Page" --status publish
```

On success it prints the new page's ID, public URL, and an edit link.

---

## Options

| Option       | Description                                            |
|--------------|--------------------------------------------------------|
| `--title`    | Page title (required)                                  |
| `--content`  | Inline HTML content                                    |
| `--file`     | Read content from a file instead of `--content`        |
| `--status`   | `publish` \| `draft` \| `private` (default: `draft`)   |
| `--dry-run`  | Print the request without sending it                   |
| `-h`, `--help` | Show help                                            |

Content precedence: `--content`, then `--file`, then stdin.

---

## Notes & gotchas

- **This creates a new page every run.** It does not update existing pages by
  title. (Updating requires the page's numeric ID and `POST /wp-json/wp/v2/pages/{id}`
  — say the word and I'll add an `update` mode.)
- **Keep your Application Password secret.** If it ever leaks, revoke it in
  **Users → Profile → Application Passwords** and create a new one. Revoking
  instantly invalidates the old one.
- **"401 / rest_cannot_create"** usually means a wrong username/password or the
  user lacks permission to create pages.
- **Network error** usually means a wrong `WP_SITE_URL` or the REST API is
  disabled/blocked by a security plugin.

---

## Why not the old browser tool?

The previously uploaded `wordpress-powershell-updater.jsx` was a UI mockup: its
"Direct API" mode only simulated success with a timer and never called WordPress,
and its generated cURL used `Authorization: Bearer` (wrong — Application Passwords
need Basic Auth) without a username. This script does the real thing, correctly.
