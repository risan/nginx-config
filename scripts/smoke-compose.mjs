#!/usr/bin/env node

// Runs the Compose commands that the README and operations guide print, with their example configs,
// and checks that both services start and become healthy.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { assert, createSmoke, request, run, runSmoke, sleep } from './smoke-kit.mjs';

const smoke = createSmoke('compose');
const repository = new URL('..', import.meta.url).pathname;
const project = `nginx-config-smoke-${randomUUID().slice(0, 8)}`;
const randomPort = () => 20000 + Math.floor(Math.random() * 20000);

function compose(args, environment) {
  return run('docker', ['compose', '-p', project, '-f', join(repository, 'compose.yaml'), ...args], { env: { ...process.env, ...environment }, cwd: repository });
}

async function waitHealthy(service, environment) {
  let status = '';
  for (let attempt = 0; attempt < 120 && status !== 'healthy'; attempt += 1) {
    const container = compose(['ps', '-q', service], environment);
    status = container ? run('docker', ['inspect', '--format', '{{.State.Health.Status}}', container]) : '';
    if (status !== 'healthy') {
      await sleep(1000);
    }
  }

  assert(status === 'healthy', `${service} did not become healthy (last status: ${status})`);
}

await runSmoke(smoke, async () => {
  const httpPort = randomPort();
  const httpsPort = randomPort();
  const site = join(smoke.workdir, 'public');
  mkdirSync(site);
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>compose smoke</title>', 'utf8');
  const certificates = join(smoke.workdir, 'ssl');
  mkdirSync(join(certificates, 'example.com'), { recursive: true });
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=example.com',
    '-keyout', join(certificates, 'example.com', 'privkey.pem'), '-out', join(certificates, 'example.com', 'fullchain.pem')
  ]);
  chmodSync(join(certificates, 'example.com', 'privkey.pem'), 0o644);

  const httpEnvironment = {
    NGINX_CONFIG: './sites-example/container.conf',
    NGINX_CONTENT: site,
    NGINX_SERVER_NAME: 'localhost',
    NGINX_CONFIG_PORT: String(httpPort)
  };
  const tlsEnvironment = {
    NGINX_TLS_CONFIG: './sites-example/container-ssl.conf',
    NGINX_TLS_CERTS: certificates,
    NGINX_TLS_SERVER_NAME: 'example.com',
    NGINX_CONFIG_TLS_PORT: String(httpsPort)
  };

  try {
    compose(['up', '-d', '--build', 'nginx'], httpEnvironment);
    await waitHealthy('nginx', httpEnvironment);
    const page = await request({ port: httpPort, host: 'localhost', path: '/' });
    assert(page.status === 200 && page.body.toString('utf8').includes('compose smoke'), `the mounted site was not served: ${page.status}`);

    compose(['--profile', 'tls', 'up', '-d', '--build', 'nginx-tls'], { ...httpEnvironment, ...tlsEnvironment });
    await waitHealthy('nginx-tls', { ...httpEnvironment, ...tlsEnvironment });
    const secure = await request({ port: httpsPort, host: 'example.com', path: '/healthz', tls: true });
    assert(secure.status === 204, `the TLS service health check returned ${secure.status}`);
  } finally {
    spawnSync('docker', ['compose', '-p', project, '-f', join(repository, 'compose.yaml'), '--profile', 'tls', 'down', '--volumes', '--remove-orphans'], {
      env: { ...process.env, ...httpEnvironment, ...tlsEnvironment },
      stdio: 'ignore'
    });
  }

  process.stdout.write('PASS the Compose HTTP and TLS examples from the docs start and become healthy\n');
});
