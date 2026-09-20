import { writeFileSync } from 'node:fs';
import { DEFAULT_OPTIONS, generateConfig } from '../lib/config.js';

const outputPath = process.argv[2] ?? '/tmp/nginx.conf';

// The container serves the built Vue application. Keep this small set of
// choices here so the image uses the canonical renderer instead of a copied
// hand-written configuration. The host-facing generator defaults remain in
// lib/config.js; only the port and document root differ inside the image.
const options = {
  ...DEFAULT_OPTIONS,
  profile: 'spa',
  serverName: 'localhost',
  listenPort: 8080,
  documentRoot: '/usr/share/nginx/html',
  tls: false,
  // Vite emits content-hashed assets, so immutable caching is safe for this
  // image even though the general renderer keeps the option off by default.
  assetCache: true,
};

const rendered = generateConfig(options);
writeFileSync(outputPath, rendered, 'utf8');
