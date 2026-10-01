#!/usr/bin/env node

// Runs the container steps that deploySteps prints for "My own certificate files", from an empty folder:
// start with HTTPS off, get a certificate with certbot, install it, switch to HTTPS, and renew.
// Pebble stands in for Let's Encrypt. The commands run as printed, with only these substitutions:
// the container gets a test name, network, and address; the published ports are random;
// certbot is pointed at Pebble and made non-interactive.
import { mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { deploySteps, generateConfig } from '../lib/render.ts';
import { defaultsFor, derivedDefaults } from '../lib/options.ts';
import { assert, createSmoke, request, runSmoke, sleep } from './smoke-kit.mjs';
import { startPebble } from './pebble-fixture.mjs';

const DOMAIN = 'acme.test';
const smoke = createSmoke('bootstrap');

function servedSerial(port, name) {
  const handshake = spawnSync('openssl', ['s_client', '-connect', `127.0.0.1:${port}`, '-servername', name], { encoding: 'utf8', input: '' });
  const certificate = spawnSync('openssl', ['x509', '-noout', '-serial', '-issuer'], { encoding: 'utf8', input: handshake.stdout ?? '' });
  const output = certificate.stdout ?? '';

  return /Pebble/i.test(output) ? /serial=([0-9A-F]+)/i.exec(output)?.[1] : undefined;
}

await runSmoke(smoke, async () => {
  const { edgeIp, pebble } = startPebble(smoke);
  const directory = join(smoke.workdir, 'deploy');
  mkdirSync(directory);
  writeFileSync(join(directory, 'placeholder'), '');
  const edge = `${smoke.network}-nginx`;
  smoke.trackContainer(edge);

  try {
    const named = { ...defaultsFor('static', 'container'), serverName: DOMAIN, wwwRedirect: 'to-apex', https: 'manual' };
    // The builder refreshes untouched paths with derivedDefaults after the name changes. The test does the same.
    const options = { ...named, ...derivedDefaults(named), httpPort: 5002, publicHttpPort: 5002 };
    const httpOff = generateConfig({ ...options, https: 'off' });
    const httpsOn = generateConfig(options);
    const steps = deploySteps(options);
    const step = (title) => {
      const found = steps.find((candidate) => candidate.title.startsWith(title));
      assert(found?.command, `deploySteps has no command step "${title}"`);

      return found.command;
    };
    const certbotPebble = '--server https://pebble:14000/dir --no-verify-ssl --non-interactive --agree-tos -m admin@example.com --no-eff-email';
    const adapt = (command) =>
      command
        .replace('--name nginx ', `--name ${edge} --network ${smoke.network} --ip ${edgeIp} `)
        .replace('-p 5002:5002', '-p 127.0.0.1::5002')
        .replace('-p 443:8443', '-p 127.0.0.1::8443')
        .replace('docker rm -f nginx', `docker rm -f ${edge}`)
        .replace('docker kill --signal HUP nginx', `docker kill --signal HUP ${edge}`)
        .replace('docker run --rm -it ', `docker run --rm --network ${smoke.network} `)
        .replace('docker run --rm -v "$PWD/letsencrypt', `docker run --rm --network ${smoke.network} -v "$PWD/letsencrypt`);
    const execute = (command) => {
      const result = spawnSync('sh', ['-c', command], { cwd: directory, encoding: 'utf8', timeout: 150000 });
      assert(result.status === 0, `step failed (${result.status}): ${command}\n${result.stdout}\n${result.stderr}`);

      return result.stdout;
    };

    // 1. HTTPS off first: the certificate does not exist yet.
    writeFileSync(join(directory, 'nginx.conf'), httpOff);
    execute(step('Create the folders'));
    execute(adapt(step('Test the config')));
    execute(adapt(step('Start the container')));
    const httpPort = await smoke.port(edge, 5002);
    await smoke.waitFor({ port: httpPort, path: '/healthz', host: DOMAIN }, 204, 'HTTPS-off container');

    // 2. Get the first certificate through the HTTP server's challenge folder.
    execute(adapt(step('Get the first certificate').replace(/ certonly(.*)$/, ` certonly$1 ${certbotPebble}`)));
    assert(existsSync(join(directory, 'letsencrypt', 'live', DOMAIN)) || spawnSync('docker', ['run', '--rm', '-v', `${join(directory, 'letsencrypt')}:/le`, 'busybox', 'test', '-e', `/le/live/${DOMAIN}/fullchain.pem`]).status === 0, `certbot did not create the lineage ${DOMAIN}`);

    // 3. Install it. The key must be readable by group 101 and nobody else.
    execute(step('Install the certificate'));
    const certificate = join(directory, 'tls', DOMAIN, 'fullchain.pem');
    const key = join(directory, 'tls', DOMAIN, 'privkey.pem');
    const mode = (path) => (statSync(path).mode & 0o777).toString(8);
    assert(mode(key) === '640' && statSync(key).uid === 0 && statSync(key).gid === 101, `key mode/owner: ${mode(key)} ${statSync(key).uid}:${statSync(key).gid}`);
    assert(mode(certificate) === '644', `certificate mode: ${mode(certificate)}`);
    const stranger = spawnSync('docker', ['run', '--rm', '--user', '1234:1234', '-v', `${join(directory, 'tls')}:/tls:ro`, 'busybox', 'cat', `/tls/${DOMAIN}/privkey.pem`], { encoding: 'utf8' });
    assert(stranger.status !== 0, 'another user could read the private key');

    // 4. Switch to HTTPS. The test runs first, and the old container is removed only if it passes.
    writeFileSync(join(directory, 'nginx.conf'), httpsOn);
    execute(adapt(step('Switch HTTPS')));
    const httpsPort = await smoke.port(edge, 8443);
    let first;
    for (let attempt = 0; attempt < 60 && !first; attempt += 1) {
      first = servedSerial(httpsPort, DOMAIN);
      if (!first) {
        await sleep(500);
      }
    }

    assert(first, 'the new container did not serve the Pebble certificate');
    const secure = await request({ port: httpsPort, host: DOMAIN, path: '/healthz', tls: true });
    assert(secure.status === 204, `HTTPS health check returned ${secure.status}`);
    const alias = await request({ port: httpsPort, host: `www.${DOMAIN}`, path: '/p?q=1', tls: true });
    assert(alias.status === 301 && alias.headers.location === `https://${DOMAIN}/p?q=1`, `alias redirect: ${alias.status} ${alias.headers.location}`);

    // 5. Renewal: the printed command renews, installs, and reloads. The served serial changes.
    execute(adapt(step('Renew certificates').replace(' renew ', ' renew --force-renewal --no-random-sleep-on-renew --no-verify-ssl --non-interactive ')));
    let renewed = first;
    for (let attempt = 0; attempt < 40 && renewed === first; attempt += 1) {
      await sleep(500);
      renewed = servedSerial(httpsPort, DOMAIN);
    }

    assert(renewed && renewed !== first, `the renewed certificate was not served after the reload (${first} -> ${renewed})`);
    process.stdout.write(`PASS the printed container bootstrap issued, installed (key 640 root:101), switched to HTTPS, and renewed a certificate from an empty folder (serial ${first} -> ${renewed})\n`);
  } finally {
    // certbot ran as root, so the host user cannot delete its files.
    spawnSync('docker', ['run', '--rm', '-v', `${directory}:/d`, 'busybox', 'sh', '-c', 'rm -rf /d/* /d/.[!.]*'], { stdio: 'ignore' });
  }

  void pebble;
});
