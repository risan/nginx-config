import { readFileSync } from 'node:fs';

const versionSource = readFileSync(new URL('../lib/version.js', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8');
const smokeImage = readFileSync(new URL('./smoke-image.sh', import.meta.url), 'utf8');
const smokeScripts = ['smoke-tls.mjs', 'smoke-proxy.mjs', 'smoke-cache.mjs', 'smoke-php.mjs']
  .map((name) => [name, readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')]);

const sourceMatch = versionSource.match(/export\s+const\s+NGINX_VERSION\s*=\s*['"]([^'"]+)['"]/);
const dockerMatch = dockerfile.match(/FROM\s+nginx:\$\{NGINX_VERSION\}-alpine/);
const dockerVersions = [...dockerfile.matchAll(/ARG\s+NGINX_VERSION=([^\s]+)/g)].map((match) => match[1]);
const composeVersions = [...compose.matchAll(/NGINX_VERSION:\s*["']([^"']+)["']/g)].map((match) => match[1]);
const digestMatch = dockerfile.match(/FROM\s+nginx:\$\{NGINX_VERSION\}-alpine@(sha256:[0-9a-f]{64})/);

if (!sourceMatch) {
  throw new Error('lib/version.js must export NGINX_VERSION');
}

const version = sourceMatch[1];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`NGINX_VERSION is not a stable semver: ${version}`);
}

if (!dockerMatch) {
  throw new Error('Dockerfile must use the canonical NGINX_VERSION build argument');
}

if (dockerVersions.length === 0 || dockerVersions.some((candidate) => candidate !== version)) {
  throw new Error(`Dockerfile NGINX_VERSION must match lib/version.js (${version})`);
}

if (composeVersions.length === 0 || composeVersions.some((candidate) => candidate !== version)) {
  throw new Error(`compose.yaml NGINX_VERSION must match lib/version.js (${version})`);
}

if (!digestMatch) {
  throw new Error('Dockerfile must pin the NGINX Alpine base image by digest');
}

const pinnedImage = `nginx:${version}-alpine@${digestMatch[1]}`;
for (const [name, source] of smokeScripts) {
  if (!source.includes(pinnedImage)) {
    throw new Error(`${name} must use the Dockerfile's pinned NGINX image (${pinnedImage})`);
  }
}

const shellVersion = smokeImage.match(/expected_nginx_version=\$\{NGINX_VERSION:-([^}]+)\}/)?.[1];
if (shellVersion !== version) {
  throw new Error(`scripts/smoke-image.sh must default to ${version}`);
}

// The build argument is intentionally repeated in the FROM line only through
// the variable. This catches an accidental stable-version edit in Compose or
// the canonical source while leaving the reviewed digest visible in Dockerfile.
console.log(`NGINX_VERSION=${version}`);
