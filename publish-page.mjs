#!/usr/bin/env node
/**
 * WordPress Page Publisher (create new pages)
 *
 * Creates a brand-new page on a WordPress site via the REST API using an
 * Application Password (HTTP Basic Auth). Requires Node.js 18+ (native fetch).
 *
 * Credentials are read from environment variables — never hard-code them and
 * never commit them. Copy .env.example to .env and fill it in, or export the
 * variables in your shell.
 *
 *   WP_SITE_URL       e.g. https://ownyoursystem.com   (no trailing slash needed)
 *   WP_USERNAME       your WordPress admin username (NOT your email, usually)
 *   WP_APP_PASSWORD   the Application Password (spaces are fine, they're stripped)
 *
 * Usage:
 *   node publish-page.mjs --title "My Page" --content "<p>Hello</p>"
 *   node publish-page.mjs --title "My Page" --file ./content.html
 *   echo "<p>Hi</p>" | node publish-page.mjs --title "My Page"
 *
 * Options:
 *   --title    <string>   Page title (required)
 *   --content  <string>   Inline page content (HTML allowed)
 *   --file     <path>     Read content from a file instead of --content
 *   --status   <string>   publish | draft | private   (default: draft)
 *   --dry-run             Show exactly what would be sent, but don't call the API
 *   -h, --help            Show this help
 */

import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { status: 'draft', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--title':   args.title = argv[++i]; break;
      case '--content': args.content = argv[++i]; break;
      case '--file':    args.file = argv[++i]; break;
      case '--status':  args.status = argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      case '-h':
      case '--help':    args.help = true; break;
      default:
        console.error(`Unknown argument: ${a}`);
        process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  // The header comment above is the source of truth; reprint the essentials.
  console.log(`WordPress Page Publisher — create a new page via the REST API

Required env vars: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD

Usage:
  node publish-page.mjs --title "My Page" --content "<p>Hello</p>"
  node publish-page.mjs --title "My Page" --file ./content.html
  echo "<p>Hi</p>" | node publish-page.mjs --title "My Page"

Options:
  --title   <string>   Page title (required)
  --content <string>   Inline HTML content
  --file    <path>     Read content from a file
  --status  <string>   publish | draft | private   (default: draft)
  --dry-run            Print the request without sending it
  -h, --help           Show this help`);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  // --- Resolve config ---
  const siteUrl = (process.env.WP_SITE_URL || '').trim().replace(/\/+$/, '');
  const username = (process.env.WP_USERNAME || '').trim();
  // Application Passwords are displayed with spaces; the API wants them stripped.
  const appPassword = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');

  const missing = [];
  if (!siteUrl) missing.push('WP_SITE_URL');
  if (!username) missing.push('WP_USERNAME');
  if (!appPassword) missing.push('WP_APP_PASSWORD');
  if (missing.length) {
    console.error(`ERROR: Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('Set them in your shell or copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  if (!args.title) {
    console.error('ERROR: --title is required.');
    process.exit(1);
  }

  const validStatuses = ['publish', 'draft', 'private'];
  if (!validStatuses.includes(args.status)) {
    console.error(`ERROR: --status must be one of: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  // --- Resolve content (precedence: --content, then --file, then stdin) ---
  let content = args.content;
  if (content == null && args.file) {
    try {
      content = readFileSync(args.file, 'utf8');
    } catch (err) {
      console.error(`ERROR: Could not read --file "${args.file}": ${err.message}`);
      process.exit(1);
    }
  }
  if (content == null && !process.stdin.isTTY) {
    content = readStdin();
  }
  if (!content || !content.trim()) {
    console.error('ERROR: No content provided. Use --content, --file, or pipe via stdin.');
    process.exit(1);
  }

  const endpoint = `${siteUrl}/wp-json/wp/v2/pages`;
  const body = { title: args.title, content, status: args.status };

  // WordPress Application Passwords use HTTP Basic Auth: base64("user:password").
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');

  if (args.dryRun) {
    console.log('[dry-run] Would POST to:', endpoint);
    console.log('[dry-run] Auth: Basic <base64 of username:app-password> (hidden)');
    console.log('[dry-run] Body:', JSON.stringify({ ...body, content: `${content.slice(0, 80)}${content.length > 80 ? '…' : ''}` }, null, 2));
    return;
  }

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`ERROR: Network request failed: ${err.message}`);
    console.error('Check WP_SITE_URL and that the site is reachable.');
    process.exit(1);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok) {
    console.error(`ERROR: WordPress returned HTTP ${res.status} ${res.statusText}`);
    if (data?.message) {
      console.error(`  ${data.code ? `[${data.code}] ` : ''}${data.message}`);
      if (data.code === 'rest_cannot_create' || res.status === 401) {
        console.error('  Hint: check WP_USERNAME and WP_APP_PASSWORD, and that the user can publish pages.');
      }
    } else {
      console.error(text.slice(0, 500));
    }
    process.exit(1);
  }

  console.log(`✓ Page created (status: ${data?.status ?? args.status})`);
  if (data?.id) console.log(`  ID:    ${data.id}`);
  if (data?.link) console.log(`  URL:   ${data.link}`);
  if (data?.id) console.log(`  Edit:  ${siteUrl}/wp-admin/post.php?post=${data.id}&action=edit`);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
