#!/usr/bin/env node

// Starts the HTTP/3 config. It always checks the UDP listener and the Alt-Svc header.
// It also needs a curl with HTTP/3 support (HTTP3_CURL_IMAGE, default ymuski/curl-http3), and it
// makes a real HTTP/3 request and fails without such a curl. Only a local run with
// ALLOW_NO_HTTP3_CLIENT=1 (and CI unset) may fall back, with a loud warning.
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, request, run, runSmoke } from './smoke-kit.mjs';

// Test-only client. Neither curlimages/curl nor Alpine's curl package has HTTP/3 (checked 2026-10-01),
// so this third-party image is pinned by digest. It is never part of the shipped image.
const CURL_IMAGE = process.env.HTTP3_CURL_IMAGE ?? 'ymuski/curl-http3@sha256:9eadfcaa6e541ef61880795c3044f7a603dd62fe5be5a3b45b5e154025c783de';
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
    // In CI a missing HTTP/3 client is a failure. Locally the check may fall back, loudly.
    if (process.env.CI || !process.env.ALLOW_NO_HTTP3_CLIENT) {
      throw new Error(`no curl with HTTP/3 in ${CURL_IMAGE}; set HTTP3_CURL_IMAGE (CI must have one), or run locally with ALLOW_NO_HTTP3_CLIENT=1 to check only the UDP listener and Alt-Svc`);
    }

    process.stderr.write('\n!!! WARNING: no HTTP/3 client available, so NO real HTTP/3 request was made. Only the UDP listener and Alt-Svc were checked. !!!\n\n');
    process.stdout.write('PASS (REDUCED, no real HTTP/3 request) HTTP/3 config starts, UDP 8443 is bound, and Alt-Svc is sent\n');

    return;
  }

  const output = smoke.docker([
    'run', '--rm', '--network', smoke.network, '--entrypoint', 'curl', CURL_IMAGE,
    '--silent', '--show-error', '--insecure', '--http3-only', '--connect-to', 'localhost:8443:edge:8443',
    '--dump-header', '-', '--output', '/dev/null', '--write-out', 'RESULT %{http_code} %{http_version}', 'https://localhost:8443/'
  ]);
  assert(/RESULT 200 3$/.test(output), `HTTP/3 request did not return 200 over HTTP/3: ${output}`);
  assert(/^alt-svc: h3=":443"; ma=86400\r?$/im.test(output), `the HTTP/3 response lacks Alt-Svc: ${output}`);

  const tcp = await request({ port: httpsPort, path: '/', tls: true });
  assert(tcp.status === 200 && tcp.headers['alt-svc'] === 'h3=":443"; ma=86400', `TCP fallback broke: ${tcp.status}`);
  process.stdout.write('PASS HTTP/3 request over QUIC returned 200 with Alt-Svc, and TCP still returns 200\n');
});
