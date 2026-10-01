// Starts the generated HTTP/3 config for smoke-http3.mjs and diagnose-http3-listener.mjs.
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, run } from './smoke-kit.mjs';

export async function startHttp3Edge(smoke) {
  const certificates = join(smoke.workdir, 'tls');
  mkdirSync(certificates);
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', join(certificates, 'privkey.pem'), '-out', join(certificates, 'fullchain.pem')
  ]);
  chmodSync(join(certificates, 'privkey.pem'), 0o644);

  const config = generateConfig({
    ...defaultsFor('static', 'container'),
    serverName: 'localhost',
    https: 'manual',
    certificatePath: '/etc/nginx/tls/fullchain.pem',
    certificateKeyPath: '/etc/nginx/tls/privkey.pem',
    http3: true
  });
  smoke.createNetwork();
  const edge = smoke.startNginx({ containerName: 'edge', alias: 'edge', config, mounts: [[certificates, '/etc/nginx/tls']], publish: [8443] });
  const httpsPort = await smoke.port(edge, 8443);
  const response = await smoke.waitFor({ port: httpsPort, path: '/healthz', tls: true }, 204, 'HTTP/3 edge');
  assert(response.headers['alt-svc'] === 'h3=":443"; ma=86400', `unexpected Alt-Svc: ${response.headers['alt-svc']}`);
  assert(response.rawHeaders.filter((value) => value.toLowerCase() === 'alt-svc').length === 1, 'Alt-Svc must appear once');

  const sockets = smoke.docker(['exec', edge, 'cat', '/proc/net/udp']);
  assert(/:20FB /i.test(sockets), `no UDP listener on 8443 (0x20FB):\n${sockets}`);

  return { edge, httpsPort };
}
