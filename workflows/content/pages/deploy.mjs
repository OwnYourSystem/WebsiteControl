import { readFileSync, writeFileSync } from 'node:fs';

const SITE_URL = (process.env.WP_SITE_URL || '').trim().replace(/\/+$/, '');
const USERNAME = (process.env.WP_USERNAME || '').trim();
const APP_PASSWORD = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');
const CHANGED_FILES = (process.env.CHANGED_FILES || '').trim().split(/\s+/).filter(Boolean);

const missing = [];
if (!SITE_URL) missing.push('WP_SITE_URL');
if (!USERNAME) missing.push('WP_USERNAME');
if (!APP_PASSWORD) missing.push('WP_APP_PASSWORD');
if (missing.length) { console.error(`ERROR: Missing: ${missing.join(', ')}`); process.exit(1); }
if (!CHANGED_FILES.length) { console.log('No changed files. Nothing to deploy.'); process.exit(0); }

let manifest = {};
try { manifest = JSON.parse(readFileSync('pages-manifest.json', 'utf8')); } catch {}

const auth = Buffer.from(`${USERNAME}:${APP_PASSWORD}`).toString('base64');

async function wpRequest(method, path, body) {
  const res = await fetch(`${SITE_URL}/wp-json/wp/v2${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

async function deployFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const entry = manifest[filePath] || {};
  const title = entry.title || filePath.replace('content/pages/', '').replace('.html', '');
  const status = entry.status || 'draft';

  if (entry.wp_id) {
    console.log(`\nUpdating "${title}" (WP ID: ${entry.wp_id})...`);
    const data = await wpRequest('POST', `/pages/${entry.wp_id}`, { title, content, status });
    console.log(`  ✓ Updated: ${data.link}`);
    manifest[filePath] = { ...entry, last_deployed: new Date().toISOString() };
  } else {
    console.log(`\nCreating "${title}" as ${status}...`);
    const data = await wpRequest('POST', '/pages', { title, content, status });
    console.log(`  ✓ Created (WP ID: ${data.id}): ${data.link}`);
    manifest[filePath] = { wp_id: data.id, title, status, last_deployed: new Date().toISOString() };
  }
}

console.log(`Deploying: ${CHANGED_FILES.join(', ')}`);
for (const file of CHANGED_FILES) {
  try { await deployFile(file); }
  catch (err) { console.error(`ERROR on ${file}: ${err.message}`); process.exit(1); }
}

writeFileSync('pages-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('\n✓ Manifest updated.');
