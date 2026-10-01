import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const versionSource = read('../lib/version.ts');
const dockerfile = read('../Dockerfile');
const compose = read('../compose.yaml');
const smokeImage = read('./smoke-image.sh');
const smokeKit = read('./smoke-kit.mjs');

const version = versionSource.match(/export\s+const\s+NGINX_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const digest = versionSource.match(/export\s+const\s+NGINX_IMAGE_DIGEST\s*=\s*['"](sha256:[0-9a-f]{64})['"]/)?.[1];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`lib/version.ts must export a stable semver NGINX_VERSION (found ${version})`);
}

if (!digest) {
  throw new Error('lib/version.ts must export NGINX_IMAGE_DIGEST as a sha256 digest');
}

if (!/export\s+const\s+NGINX_IMAGE\s*=\s*`nginx:\$\{NGINX_VERSION\}-alpine@\$\{NGINX_IMAGE_DIGEST\}`/.test(versionSource)) {
  throw new Error('lib/version.ts must build NGINX_IMAGE from NGINX_VERSION and NGINX_IMAGE_DIGEST');
}

if (!/FROM\s+nginx:\$\{NGINX_VERSION\}-alpine@sha256:[0-9a-f]{64}/.test(dockerfile)) {
  throw new Error('Dockerfile must pin the NGINX Alpine base image by digest through NGINX_VERSION');
}

const dockerVersions = [...dockerfile.matchAll(/ARG\s+NGINX_VERSION=([^\s]+)/g)].map((match) => match[1]);
if (dockerVersions.length === 0 || dockerVersions.some((candidate) => candidate !== version)) {
  throw new Error(`Dockerfile NGINX_VERSION must match lib/version.ts (${version})`);
}

const dockerDigest = dockerfile.match(/FROM\s+nginx:\$\{NGINX_VERSION\}-alpine@(sha256:[0-9a-f]{64})/)?.[1];
if (dockerDigest !== digest) {
  throw new Error(`Dockerfile digest ${dockerDigest} must match lib/version.ts (${digest})`);
}

const composeVersions = [...compose.matchAll(/NGINX_VERSION:\s*["']([^"']+)["']/g)].map((match) => match[1]);
if (composeVersions.length === 0 || composeVersions.some((candidate) => candidate !== version)) {
  throw new Error(`compose.yaml NGINX_VERSION must match lib/version.ts (${version})`);
}

if (!/import \{ NGINX_IMAGE \} from '\.\.\/lib\/version\.ts'/.test(smokeKit)) {
  throw new Error('scripts/smoke-kit.mjs must take its default image from lib/version.ts');
}

const shellVersion = smokeImage.match(/expected_nginx_version=\$\{NGINX_VERSION:-([^}]+)\}/)?.[1];
if (shellVersion !== version) {
  throw new Error(`scripts/smoke-image.sh must default to ${version}`);
}

console.log(`NGINX_VERSION=${version}`);
console.log(`NGINX_IMAGE_DIGEST=${digest}`);
