#!/usr/bin/env node

// Qualification for HTTP/3: a real HTTP/3 request over QUIC must return 200 with Alt-Svc, and TCP must still work.
// It needs a curl with HTTP/3 support (HTTP3_CURL_IMAGE). Without one it FAILS. There is no reduced mode here.
// For a listener-only check on a machine without such a client, run scripts/diagnose-http3-listener.mjs.
import { spawnSync } from 'node:child_process';

import { assert, createSmoke, request, runSmoke } from './smoke-kit.mjs';
import { startHttp3Edge } from './http3-fixture.mjs';

// Test-only client. Neither curlimages/curl nor Alpine's curl package has HTTP/3 (checked 2026-10-01),
// so this third-party image is pinned by digest. It is never part of the shipped image.
const CURL_IMAGE = process.env.HTTP3_CURL_IMAGE ?? 'ymuski/curl-http3@sha256:9eadfcaa6e541ef61880795c3044f7a603dd62fe5be5a3b45b5e154025c783de';
const smoke = createSmoke('http3');

function curlSupportsHttp3() {
  const result = spawnSync('docker', ['run', '--rm', '--entrypoint', 'curl', CURL_IMAGE, '--version'], { encoding: 'utf8' });

  return result.status === 0 && /Features:.*HTTP3/.test(result.stdout);
}

await runSmoke(smoke, async () => {
  assert(curlSupportsHttp3(), `no curl with HTTP/3 in ${CURL_IMAGE}. Set HTTP3_CURL_IMAGE to an image whose curl lists the HTTP3 feature.`);
  const { httpsPort } = await startHttp3Edge(smoke);
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
