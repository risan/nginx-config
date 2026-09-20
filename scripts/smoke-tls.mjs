#!/usr/bin/env node

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { connect as connectHttp2 } from 'node:http2';
import { DEFAULT_OPTIONS, generateConfig } from '../lib/config.js';

const image = process.argv[2]
  ?? process.env.NGINX_IMAGE
  ?? 'nginx:1.30.5-alpine@sha256:a5f2157a0302eb0c5e300415effb63a9e70ed1eb9c107283819bf6d149ab607c';
const workdir = mkdtempSync(join(tmpdir(), 'nginx-config-tls-'));
const certDir = join(workdir, 'tls');
const network = `nginx-config-tls-${randomUUID().slice(0, 12)}`;
const edgeName = `${network}-edge`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} failed with exit ${result.status ?? 'signal'}`);
  }
  return result.stdout.trim();
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', edgeName], { stdio: 'ignore' });
  spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
  rmSync(workdir, { recursive: true, force: true });
}

function printLogs() {
  const logs = spawnSync('docker', ['logs', edgeName], { encoding: 'utf8' });
  process.stderr.write(`edge logs:\n${logs.stdout ?? ''}${logs.stderr ?? ''}`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttps(url, expectedStatus, label) {
  let lastResponse = 'no response';
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = spawnSync('curl', [
      '--silent', '--show-error', '--insecure', '--connect-timeout', '1', '--max-time', '2',
      '--output', '/dev/null', '--write-out', '%{http_code}',
      '--header', 'Host: localhost', url
    ], { encoding: 'utf8' });
    lastResponse = `exit=${response.status ?? 'signal'} status=${response.stdout.trim()}${response.stderr.trim() ? ` error=${response.stderr.trim()}` : ''}`;
    if (response.status === 0 && response.stdout.trim() === expectedStatus) return;
    await sleep(100);
  }
  throw new Error(`${label} did not become ready (${lastResponse})`);
}

try {
  mkdirSync(certDir);
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', join(certDir, 'privkey.pem'),
    '-out', join(certDir, 'fullchain.pem')
  ]);
  // The fixture is disposable and lives only under /tmp. Make the key readable
  // by the image's UID 101 so this checks the actual unprivileged TLS path.
  chmodSync(join(certDir, 'privkey.pem'), 0o644);
  const configPath = join(workdir, 'nginx.conf');
  const config = generateConfig({
    ...DEFAULT_OPTIONS,
    profile: 'spa',
    serverName: 'localhost',
    listenPort: 8080,
    httpsPort: 8443,
    tls: true,
    hsts: true,
    certificatePath: '/tmp/nginx-config-tls/fullchain.pem',
    certificateKeyPath: '/tmp/nginx-config-tls/privkey.pem'
  });
  if (!config.includes('ssl_session_tickets on;') || !config.includes('ssl_early_data off;')) {
    throw new Error('TLS smoke fixture must keep ticket resumption on and early data off');
  }
  writeFileSync(configPath, config, 'utf8');

  run('docker', ['network', 'create', network]);
  run('docker', [
    'run', '-d', '--name', edgeName,
    '--network', network,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777',
    '--user', '101:101',
    '-p', '127.0.0.1::8080',
    '-p', '127.0.0.1::8443',
    '--mount', `type=bind,src=${configPath},dst=/etc/nginx/nginx.conf,readonly`,
    '--mount', `type=bind,src=${certDir},dst=/tmp/nginx-config-tls,readonly`,
    '--entrypoint', 'nginx', image, '-g', 'daemon off;'
  ]);

  async function discoverPort(containerPort) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const mapping = spawnSync('docker', ['port', edgeName, `${containerPort}/tcp`], { encoding: 'utf8' });
      const port = mapping.stdout.trim().match(/:(\d+)$/)?.[1];
      if (port) return port;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const logs = spawnSync('docker', ['logs', edgeName], { encoding: 'utf8' });
    process.stderr.write(`${logs.stdout ?? ''}${logs.stderr ?? ''}`);
    throw new Error(`could not discover TLS smoke port ${containerPort}`);
  }

  const httpPort = await discoverPort(8080);
  const httpsPort = await discoverPort(8443);
  await waitForHttps(`https://localhost:${httpsPort}/healthz`, '204', 'TLS smoke endpoint');
  const redirect = run('curl', [
    '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}',
    '--header', 'Host: localhost', `http://127.0.0.1:${httpPort}/settings`
  ]);
  if (redirect !== '308') throw new Error(`HTTP did not redirect to HTTPS: ${redirect}`);

  const headers = run('curl', [
    '--silent', '--show-error', '--insecure', '--dump-header', '-', '--output', '/dev/null',
    '--header', 'Host: localhost', `https://localhost:${httpsPort}/healthz`
  ]);
  if (!/^HTTP\/\S+ 204/m.test(headers)) throw new Error(`HTTPS health endpoint failed:\n${headers}`);
  if (!/^Strict-Transport-Security:/mi.test(headers)) throw new Error('HTTPS health response omitted HSTS');

  await new Promise((resolve, reject) => {
    const client = connectHttp2(`https://127.0.0.1:${httpsPort}`, {
      rejectUnauthorized: false,
      servername: 'localhost'
    });
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error('HTTP/2 health request timed out'));
    }, 3000);
    const fail = (error) => {
      clearTimeout(timer);
      client.destroy();
      reject(error);
    };
    client.once('error', fail);
    client.once('connect', () => {
      if (client.alpnProtocol !== 'h2') {
        fail(new Error(`expected ALPN h2, got ${client.alpnProtocol || 'none'}`));
        return;
      }
      const request = client.request({ ':authority': 'localhost', ':path': '/healthz' });
      let status;
      request.once('response', (responseHeaders) => {
        status = responseHeaders[':status'];
      });
      request.once('error', fail);
      request.once('end', () => {
        clearTimeout(timer);
        client.close();
        if (status !== 204) {
          reject(new Error(`HTTP/2 health endpoint returned ${status}`));
          return;
        }
        resolve();
      });
      request.resume();
      request.end();
    });
  });

  function assertResumption(protocol, sessionPath = null) {
    const args = [
      's_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost',
      protocol, ...(sessionPath ? ['-sess_in', sessionPath] : ['-reconnect'])
    ];
    const result = spawnSync('openssl', args, { encoding: 'utf8', input: '' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const protocolLabel = protocol === '-tls1_2' ? 'TLSv1.2' : 'TLSv1.3';
    if (result.status !== 0 || !new RegExp(`Reused, ${protocolLabel.replace('.', '\\.')}`).test(output)) {
      throw new Error(`${protocolLabel} session resumption failed:\n${output}`);
    }
  }

  // TLS 1.2 uses the shared session cache; TLS 1.3 uses a ticket issued by it.
  assertResumption('-tls1_2');
  const tls13Session = join(workdir, 'tls13-session.pem');
  const firstTls13 = spawnSync('openssl', [
    's_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost',
    '-tls1_3', '-sess_out', tls13Session, '-quiet'
  ], { encoding: 'utf8', input: '' });
  if (firstTls13.status !== 0) {
    throw new Error(`TLSv1.3 initial session failed:\n${firstTls13.stdout ?? ''}${firstTls13.stderr ?? ''}`);
  }
  assertResumption('-tls1_3', tls13Session);

  // A TLS 1.3 ticket issued with ssl_early_data off must not permit 0-RTT.
  const earlyDataPath = join(workdir, 'early-data.txt');
  writeFileSync(earlyDataPath, 'GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n', 'utf8');
  const earlyData = spawnSync('openssl', [
    's_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'localhost',
    '-tls1_3', '-sess_in', tls13Session, '-early_data', earlyDataPath
  ], { encoding: 'utf8', input: '' });
  const earlyOutput = `${earlyData.stdout ?? ''}${earlyData.stderr ?? ''}`;
  if (earlyData.status !== 0 || /Early data was accepted/i.test(earlyOutput)) {
    throw new Error(`TLS early data was accepted or the probe failed:\n${earlyOutput}`);
  }

  for (const protocol of ['-tls1_2', '-tls1_3']) {
    const unknownSni = spawnSync('openssl', [
      's_client', '-connect', `127.0.0.1:${httpsPort}`, '-servername', 'unknown.example',
      protocol, '-brief'
    ], { encoding: 'utf8', input: '' });
    if (unknownSni.status === 0) {
      throw new Error(`unknown SNI was accepted for ${protocol}:\n${unknownSni.stdout ?? ''}${unknownSni.stderr ?? ''}`);
    }
  }

  process.stdout.write('PASS TLS redirect, certificate, HTTP/2, HSTS, TLS 1.2/1.3 resumption, early-data, and unknown-SNI checks\n');
} catch (error) {
  printLogs();
  throw error;
} finally {
  cleanup();
}
