#!/usr/bin/env node

// DIAGNOSTIC ONLY. This is not HTTP/3 qualification: it never makes an HTTP/3 request.
// It checks that the generated config starts, that UDP 8443 is bound, and that Alt-Svc is sent.
// Use scripts/smoke-http3.mjs for the real check.
import { createSmoke, runSmoke } from './smoke-kit.mjs';
import { startHttp3Edge } from './http3-fixture.mjs';

const smoke = createSmoke('http3-diagnostic');

await runSmoke(smoke, async () => {
  await startHttp3Edge(smoke);
  process.stdout.write('DIAGNOSTIC ONLY (not qualification): HTTP/3 config starts, UDP 8443 is bound, and Alt-Svc is sent. No HTTP/3 request was made.\n');
});
