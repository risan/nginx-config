#!/usr/bin/env node

// Issues a certificate from a local Pebble ACME server through the generated config.
// It proves that the HTTP-01 challenge is answered by the HTTP server that also redirects to HTTPS.
import { spawnSync } from 'node:child_process';

import { deploySteps, generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, run, runSmoke, sleep, request } from './smoke-kit.mjs';
import { startPebble } from './pebble-fixture.mjs';

const DOMAIN = 'acme.test';

const smoke = createSmoke('acme');

await runSmoke(smoke, async () => {
  const { edgeIp: EDGE_IP, pebble } = startPebble(smoke);

  const options = {
    ...defaultsFor('static', 'container'),
    serverName: DOMAIN,
    https: 'acme',
    acmeEmail: 'admin@example.com',
    httpPort: 5002,
    publicHttpPort: 5002,
    wwwRedirect: 'to-apex'
  };
  // Run the exact volume command that deploySteps tells container users to run, on a throwaway volume.
  const volumeStep = deploySteps(options).find((step) => step.title.startsWith('Create a volume'));
  assert(volumeStep?.command, 'deploySteps has no ACME volume step');
  const volume = `${smoke.network}-state`;
  smoke.volumes.push(volume);
  run('sh', ['-c', volumeStep.command.replaceAll('nginx-acme', volume)]);

  // Only the CA address changes: Pebble replaces Let's Encrypt and uses its own test CA.
  const config = generateConfig(options)
    .replace('uri https://acme-v02.api.letsencrypt.org/directory;', 'uri https://pebble:14000/dir;\n        ssl_verify off;');
  assert(config.includes('https://pebble:14000/dir'), 'could not point the ACME issuer at Pebble');

  const edge = smoke.startNginx({
    containerName: 'edge',
    config,
    extraArgs: ['--ip', EDGE_IP, '--read-only', '--cap-drop=ALL', '--security-opt', 'no-new-privileges:true', '-v', `${volume}:/var/cache/nginx`],
    publish: [8443, 5002]
  });
  let httpsPort = await smoke.port(edge, 8443);
  const httpPort = await smoke.port(edge, 5002);

  const names = [DOMAIN, `www.${DOMAIN}`];
  const served = (name) => {
    const handshake = spawnSync('openssl', ['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', name], { encoding: 'utf8', input: '' });
    const certificate = spawnSync('openssl', ['x509', '-noout', '-serial', '-issuer', '-ext', 'subjectAltName'], { encoding: 'utf8', input: handshake.stdout ?? '' });
    const output = certificate.stdout ?? '';
    const serial = /serial=([0-9A-F]+)/i.exec(output)?.[1];

    return /Pebble/i.test(output) && serial && output.includes(`DNS:${name}`) ? { serial, output } : null;
  };
  const waitForCertificates = async (seconds) => {
    const found = {};
    for (let attempt = 0; attempt < seconds && Object.keys(found).length < names.length; attempt += 1) {
      for (const name of names) {
        found[name] ??= served(name) ?? undefined;
        if (!found[name]) {
          delete found[name];
        }
      }

      if (Object.keys(found).length < names.length) {
        await sleep(1000);
      }
    }

    return found;
  };
  const orderCount = () => (spawnSync('docker', ['logs', pebble], { encoding: 'utf8' }).stderr + spawnSync('docker', ['logs', pebble], { encoding: 'utf8' }).stdout).split('\n').filter((line) => /POST \/order-plz/.test(line)).length;

  const issued = await waitForCertificates(150);
  assert(Object.keys(issued).length === names.length, `Pebble did not issue certificates for ${names.join(' and ')} within 150 seconds: ${JSON.stringify(Object.keys(issued))}`);
  assert(issued[names[0]].serial !== issued[names[1]].serial, 'the alias should get its own certificate');
  const ordersBefore = orderCount();
  assert(ordersBefore >= 2, `expected at least two orders at Pebble, saw ${ordersBefore}`);

  // Both names redirect to the canonical HTTPS URL in one hop, through the same server that answered the challenge.
  for (const name of names) {
    const redirect = await request({ port: httpPort, host: name, path: '/some/page?x=1' });
    assert(redirect.status === 308 && redirect.headers.location === `https://${DOMAIN}/some/page?x=1`, `${name}: HTTP did not redirect to HTTPS: ${redirect.status} ${redirect.headers.location}`);
  }

  const secure = await request({ port: httpsPort, host: DOMAIN, path: '/healthz', tls: true });
  assert(secure.status === 204, `HTTPS request with the issued certificate returned ${secure.status}`);
  const aliasRedirect = await request({ port: httpsPort, host: `www.${DOMAIN}`, path: '/p?q=1', tls: true });
  assert(aliasRedirect.status === 301 && aliasRedirect.headers.location === `https://${DOMAIN}/p?q=1`, `HTTPS alias redirect: ${aliasRedirect.status} ${aliasRedirect.headers.location}`);

  // Restart with the same state volume: the same certificates come back quickly, and no new order is made.
  smoke.docker(['restart', edge]);
  httpsPort = await smoke.port(edge, 8443);
  const reused = await waitForCertificates(20);
  for (const name of names) {
    assert(reused[name]?.serial === issued[name].serial, `${name}: the certificate was not reused after a restart (${reused[name]?.serial} vs ${issued[name].serial})`);
  }

  await sleep(5000);
  assert(orderCount() === ordersBefore, `a restart created new orders at Pebble (${ordersBefore} -> ${orderCount()})`);

  process.stdout.write(`PASS Pebble issued separate certificates for ${names.join(' and ')} through the HTTP redirect server, and a restart reused them without a new order\n`);
});
