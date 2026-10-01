#!/usr/bin/env node

// Issues a certificate from a local Pebble ACME server through the generated config.
// It proves that the HTTP-01 challenge is answered by the HTTP server that also redirects to HTTPS.
import { spawnSync } from 'node:child_process';

import { deploySteps, generateConfig } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, run, runSmoke, sleep, request } from './smoke-kit.mjs';

const PEBBLE_IMAGE = process.env.PEBBLE_IMAGE ?? 'ghcr.io/letsencrypt/pebble:latest';
const CHALLENGE_IMAGE = process.env.PEBBLE_CHALLTESTSRV_IMAGE ?? 'ghcr.io/letsencrypt/pebble-challtestsrv:latest';
const DOMAIN = 'acme.test';

const smoke = createSmoke('acme');

// Pebble resolves the test domain through challtestsrv, which needs the edge address up front.
// So the network gets a fixed subnet. A random 10.x range avoids clashing with other networks.
function createNetworkWithFixedSubnet() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const subnet = process.env.SMOKE_ACME_SUBNET ?? `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.0/24`;
    try {
      smoke.createNetwork(['--subnet', subnet]);

      return subnet.replace(/\.0\/24$/, '');
    } catch (error) {
      if (process.env.SMOKE_ACME_SUBNET) {
        throw error;
      }
    }
  }

  throw new Error('could not find a free subnet for the ACME smoke network');
}

await runSmoke(smoke, async () => {
  const prefix = createNetworkWithFixedSubnet();
  const EDGE_IP = `${prefix}.10`;
  const DNS_IP = `${prefix}.11`;
  const PEBBLE_IP = `${prefix}.12`;

  smoke.startContainer('dns', ['--ip', DNS_IP, CHALLENGE_IMAGE, '-defaultIPv6', '', '-defaultIPv4', EDGE_IP]);
  smoke.startContainer('pebble', [
    '--ip', PEBBLE_IP, '--network-alias', 'pebble',
    '-e', 'PEBBLE_VA_NOSLEEP=1', '-e', 'PEBBLE_VA_ALWAYS_VALID=0',
    PEBBLE_IMAGE, '-config', 'test/config/pebble-config.json', '-dnsserver', `${DNS_IP}:8053`
  ]);

  const options = {
    ...defaultsFor('static', 'container'),
    serverName: DOMAIN,
    https: 'acme',
    acmeEmail: 'admin@example.com',
    httpPort: 5002,
    publicHttpPort: 5002
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
  const httpsPort = await smoke.port(edge, 8443);
  const httpPort = await smoke.port(edge, 5002);

  let issuer = '';
  for (let attempt = 0; attempt < 120 && !issuer; attempt += 1) {
    const result = spawnSync('openssl', ['s_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', DOMAIN], { encoding: 'utf8', input: '' });
    issuer = /issuer=.*Pebble.*|i:.*Pebble.*/i.exec(result.stdout ?? '')?.[0] ?? '';
    if (!issuer) {
      await sleep(1000);
    }
  }

  assert(issuer, 'no certificate from Pebble was served within 2 minutes');

  const redirect = await request({ port: httpPort, host: DOMAIN, path: '/some/page?x=1' });
  assert(redirect.status === 308 && redirect.headers.location === `https://${DOMAIN}/some/page?x=1`, `HTTP did not redirect to HTTPS: ${redirect.status} ${redirect.headers.location}`);

  const secure = await request({ port: httpsPort, host: DOMAIN, path: '/healthz', tls: true });
  assert(secure.status === 204, `HTTPS request with the issued certificate returned ${secure.status}`);

  process.stdout.write(`PASS Pebble issued a certificate through the HTTP redirect server (${issuer.trim()})\n`);
});
