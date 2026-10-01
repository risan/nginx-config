#!/usr/bin/env node

// Starts the HTTP/3 config. It always checks the UDP listener and the Alt-Svc header.
// When a curl with HTTP/3 support is available (HTTP3_CURL_IMAGE, default ymuski/curl-http3), it also
// makes a real HTTP/3 request. Without such a curl the request is skipped and the script says so.
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, request, run, runSmoke } from './smoke-kit.mjs';

const CURL_IMAGE = process.env.HTTP3_CURL_IMAGE ?? 'ymuski/curl-http3:latest';
const smoke = createSmoke('http3');

function curlSupportsHttp3() {
  const result = spawnSync('docker', ['run', '--rm', '--entrypoint', 'curl', CURL_IMAGE, '--version'], { encoding: 'utf8' });

  return result.status === 0 && /Features:.*HTTP3/.test(result.stdout);
}

await runSmoke(smoke, async () => {
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
    certificatePath: '/tmp/nginx-config-tls/fullchain.pem',
    certificateKeyPath: '/tmp/nginx-config-tls/privkey.pem',
    http3: true
  });
  smoke.createNetwork();
  const edge = smoke.startNginx({ containerName: 'edge', alias: 'edge', config, mounts: [[certificates, '/tmp/nginx-config-tls']], publish: [8443] });
  const httpsPort = await smoke.port(edge, 8443);
  const response = await smoke.waitFor({ port: httpsPort, path: '/healthz', tls: true }, 204, 'HTTP/3 edge');
  assert(response.headers['alt-svc'] === 'h3=":443"; ma=86400', `unexpected Alt-Svc: ${response.headers['alt-svc']}`);
  assert(response.rawHeaders.filter((value) => value.toLowerCase() === 'alt-svc').length === 1, 'Alt-Svc must appear once');

  const sockets = smoke.docker(['exec', edge, 'cat', '/proc/net/udp']);
  assert(/:20FB /i.test(sockets), `no UDP listener on 8443 (0x20FB):\n${sockets}`);

  if (!curlSupportsHttp3()) {
    process.stdout.write(`PASS HTTP/3 config starts, UDP 8443 is bound, and Alt-Svc is sent (real HTTP/3 request skipped: no curl with HTTP/3 in ${CURL_IMAGE})\n`);

    return;
  }

  const output = smoke.docker([
    'run', '--rm', '--network', smoke.network, '--entrypoint', 'curl', CURL_IMAGE,
    '--silent', '--show-error', '--insecure', '--http3-only', '--connect-to', 'localhost:8443:edge:8443',
    '--write-out', '%{http_code} %{http_version}', '--output', '/dev/null', 'https://localhost:8443/healthz'
  ]);
  assert(output === '204 3', `HTTP/3 request failed: ${output}`);

  const tcp = await request({ port: httpsPort, path: '/healthz', tls: true });
  assert(tcp.status === 204, 'TCP fallback stopped working');
  process.stdout.write('PASS HTTP/3 request over QUIC returned 204, and TCP still works\n');
});
