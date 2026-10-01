#!/usr/bin/env node

// Runs the Compose commands that the README and operations guide print, with their example configs,
// and checks that both services start and become healthy.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { assert, createSmoke, request, run, runSmoke, sleep } from './smoke-kit.mjs';
import { environmentOf, httpExamples, tlsExamples } from './compose-examples.mjs';

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

  // The environment is read from the printed commands. Only what the docs mark as a placeholder is replaced:
  // the content folder, the certificate folder, and host ports (so the run cannot clash with a local service).
  const printedHttp = httpExamples().find((example) => example.source === 'README.md' && example.config.includes('sites-example'));
  const printedTls = tlsExamples().find((example) => example.source === 'docs/operations.md' && example.config.includes('sites-example'));
  assert(printedHttp && printedTls, 'the README or the operations guide no longer prints a Compose example');
  const httpEnvironment = { ...environmentOf(printedHttp.block), NGINX_CONTENT: site, NGINX_CONFIG_PORT: String(httpPort) };
  const tlsEnvironment = { ...environmentOf(printedTls.block), NGINX_TLS_CERTS: certificates, NGINX_CONFIG_TLS_PORT: String(httpsPort) };
  const httpName = httpEnvironment.NGINX_SERVER_NAME;
  const tlsName = tlsEnvironment.NGINX_TLS_SERVER_NAME;
  mkdirSync(join(certificates, tlsName), { recursive: true });
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${tlsName}`,
    '-keyout', join(certificates, tlsName, 'privkey.pem'), '-out', join(certificates, tlsName, 'fullchain.pem')
  ]);
  chmodSync(join(certificates, tlsName, 'privkey.pem'), 0o644);

  try {
    compose(['up', '-d', '--build', 'nginx'], httpEnvironment);
    await waitHealthy('nginx', httpEnvironment);
    const page = await request({ port: httpPort, host: httpName, path: '/' });
    assert(page.status === 200 && page.body.toString('utf8').includes('compose smoke'), `the mounted site was not served: ${page.status}`);

    compose(['--profile', 'tls', 'up', '-d', '--build', 'nginx-tls'], { ...httpEnvironment, ...tlsEnvironment });
    await waitHealthy('nginx-tls', { ...httpEnvironment, ...tlsEnvironment });
    const secure = await request({ port: httpsPort, host: tlsName, path: '/healthz', tls: true });
    assert(secure.status === 204, `the TLS service health check returned ${secure.status}`);
  } finally {
    spawnSync('docker', ['compose', '-p', project, '-f', join(repository, 'compose.yaml'), '--profile', 'tls', 'down', '--volumes', '--remove-orphans'], {
      env: { ...process.env, ...httpEnvironment, ...tlsEnvironment },
      stdio: 'ignore'
    });
  }

  process.stdout.write('PASS the Compose HTTP and TLS examples from the docs start and become healthy\n');
});
