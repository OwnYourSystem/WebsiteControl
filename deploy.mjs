import { readFileSync, writeFileSync } from 'node:fs';

const SITE_URL = (process.env.WP_SITE_URL || '').trim().replace(/\/+$/, '');
const USERNAME = (process.env.WP_USERNAME || '').trim();
const APP_PASSWORD = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');
const CHANGED_FILES = (process.env.CHANGED_FILES || '').trim().split(/\s+/).filter(Boolean);

if (!SITE_URL || !USERNAME || !APP_PASSWORD) {
  console.error('Missing required env vars: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD');
  process.exit(1);
}

if (CHANGED_FILES.length === 0) {
  console.log('No changed files detected. Exiting.');
  process.exit(0);
}

const AUTH = Buffer.from(`${USERNAME}:${APP_PASSWORD}`).toString('base64');
const HEADERS = {
  'Authorization': `Basic ${AUTH}`,
  'Content-Type': 'application/json',
};

let manifest = {};
try {
  manifest = JSON.parse(readFileSync('pages-manifest.json', 'utf8'));
} catch {
  console.log('No existing manifest, starting fresh.');
}

for (const filePath of CHANGED_FILES) {
  const html = readFileSync(filePath, 'utf8');
  const slug = filePath.replace('content/pages/', '').replace('.html', '');
  const title = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');

  // Read status from <!-- status: publish --> comment, default to draft
  const statusMatch = html.match(/<!--\s*status:\s*(publish|draft|private)\s*-->/i);
  const status = statusMatch ? statusMatch[1].toLowerCase() : 'draft';

  const entry = manifest[filePath];
  const wpId = entry?.wp_id;

  const body = JSON.stringify({ title, content: html, status });

  let url = `${SITE_URL}/wp-json/wp/v2/pages`;
  let method = 'POST';
  if (wpId) {
    url = `${SITE_URL}/wp-json/wp/v2/pages/${wpId}`;
    method = 'POST';
  }

  console.log(`${wpId ? 'Updating' : 'Creating'} page "${title}" as ${status} (${filePath})...`);

  const res = await fetch(url, { method, headers: HEADERS, body });
  const data = await res.json();

  if (!res.ok) {
    console.error(`Failed for ${filePath}:`, data);
    process.exit(1);
  }

  manifest[filePath] = { wp_id: data.id, title, status: data.status };
  console.log(`  Done — WordPress page ID: ${data.id}, status: ${data.status}`);
}

writeFileSync('pages-manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated.');
