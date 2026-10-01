// Shared helpers for the runtime smoke scripts. Each script runs the real image on a private
// Docker network, sends requests to it, and removes everything it created.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { createHash } from 'node:crypto';

import { NGINX_IMAGE } from '../lib/version.ts';

export const TMPFS = '/tmp:rw,noexec,nosuid,nodev,uid=101,gid=101,mode=1777';

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed with exit ${result.status ?? 'signal'}`);
  }

  return result.stdout.trim();
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function countHeader(response, name) {
  return response.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name.toLowerCase()).length;
}

// One HTTP or HTTPS request. Raw headers are kept so tests can count repeated header lines.
export function request({ port, path = '/', method = 'GET', host = 'localhost', headers = {}, tls = false, body, agent }) {
  return new Promise((resolve, reject) => {
    const transport = tls ? https : http;
    const options = {
      host: '127.0.0.1',
      port,
      path,
      method,
      agent,
      headers: { Host: host, ...headers },
      ...(tls ? { rejectUnauthorized: false, servername: host.replace(/:\d+$/, '') } : {})
    };
    const req = transport.request(options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          rawHeaders: response.rawHeaders,
          body: Buffer.concat(chunks)
        })
      );
    });
    req.setTimeout(10000, () => req.destroy(new Error(`request timed out: ${method} ${path}`)));
    req.on('error', reject);
    req.end(body);
  });
}

export function createSmoke(name, image = process.argv[2] ?? process.env.NGINX_IMAGE ?? NGINX_IMAGE) {
  const id = randomUUID().slice(0, 12);
  const network = `nginx-config-${name}-${id}`;
  const workdir = mkdtempSync(join(tmpdir(), `nginx-config-${name}-`));
  const containers = [];
  const volumes = [];

  const smoke = {
    image,
    network,
    workdir,
    volumes,

    writeFile(fileName, content) {
      const path = join(workdir, fileName);
      writeFileSync(path, content, 'utf8');

      return path;
    },

    docker(args, options) {
      return run('docker', args, options);
    },

    createNetwork(extraArgs = []) {
      run('docker', ['network', 'create', ...extraArgs, network]);
    },

    // Starts NGINX as the unprivileged image user with a read-only config mount.
    startNginx({ containerName, config, alias, publish = [], mounts = [], networkMode, user = '101:101', extraArgs = [], entrypointImage = image }) {
      const configPath = smoke.writeFile(`${containerName}.conf`, config);
      const fullName = `${network}-${containerName}`;
      containers.push(fullName);
      const args = [
        'run', '-d', '--name', fullName,
        '--network', networkMode ?? network,
        ...(alias && !networkMode ? ['--network-alias', alias] : []),
        '--tmpfs', TMPFS,
        '--user', user,
        ...publish.flatMap((port) => ['-p', `127.0.0.1::${port}`]),
        '--mount', `type=bind,src=${configPath},dst=/etc/nginx/nginx.conf,readonly`,
        ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,src=${source},dst=${target},readonly`]),
        ...extraArgs,
        '--entrypoint', 'nginx', entrypointImage, '-g', 'daemon off;'
      ];
      run('docker', args);

      return fullName;
    },

    trackContainer(fullName) {
      containers.push(fullName);
    },

    startContainer(containerName, args) {
      const fullName = `${network}-${containerName}`;
      containers.push(fullName);
      run('docker', ['run', '-d', '--name', fullName, '--network', network, ...args]);

      return fullName;
    },

    async port(fullName, containerPort, protocol = 'tcp') {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const mapping = spawnSync('docker', ['port', fullName, `${containerPort}/${protocol}`], { encoding: 'utf8' });
        const port = mapping.stdout.trim().match(/:(\d+)$/m)?.[1];
        if (port) {
          return Number(port);
        }

        await sleep(100);
      }

      throw new Error(`could not discover published port ${containerPort} of ${fullName}`);
    },

    async waitFor(options, expectedStatus, label) {
      let last = 'no response';
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const response = await request(options);
          last = `status ${response.status}`;
          if (response.status === expectedStatus) {
            return response;
          }
        } catch (error) {
          last = error.message;
        }

        await sleep(100);
      }

      throw new Error(`${label} did not return ${expectedStatus} (${last})`);
    },

    printLogs() {
      for (const container of containers) {
        const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8' });
        process.stderr.write(`--- logs of ${container}\n${logs.stdout ?? ''}${logs.stderr ?? ''}`);
      }
    },

    cleanup() {
      if (containers.length > 0) {
        spawnSync('docker', ['rm', '-f', ...containers], { stdio: 'ignore' });
      }

      spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' });
      if (volumes.length > 0) {
        spawnSync('docker', ['volume', 'rm', '-f', ...volumes], { stdio: 'ignore' });
      }

      rmSync(workdir, { recursive: true, force: true });
    }
  };

  return smoke;
}

// Wraps a smoke script body so logs print on failure and cleanup always runs.
export async function runSmoke(smoke, body) {
  try {
    await body();
  } catch (error) {
    smoke.printLogs();
    throw error;
  } finally {
    smoke.cleanup();
  }
}

// A tiny backend that reports what it received. NGINX itself plays the backend, so no extra image is needed.
export function echoBackendConfig({ port = 8081, extraLocations = '' } = {}) {
  return `pid /tmp/backend.pid;
events { worker_connections 64; }
http {
    client_body_temp_path /tmp/c;
    proxy_temp_path /tmp/p;
    fastcgi_temp_path /tmp/f;
    uwsgi_temp_path /tmp/u;
    scgi_temp_path /tmp/s;
    access_log off;
    server {
        listen ${port};
        default_type text/plain;
${extraLocations}
        location / {
            return 200 "host=$http_host\\nxff=$http_x_forwarded_for\\nreal=$http_x_real_ip\\nproto=$http_x_forwarded_proto\\nport=$http_x_forwarded_port\\nforwarded=$http_forwarded\\nconnection=$http_connection\\nupgrade=$http_upgrade\\nrid=$http_x_request_id\\nconn=$connection\\nconn_requests=$connection_requests\\nremote=$remote_addr\\n";
        }
    }
}
`;
}

export function parseEcho(body) {
  const fields = {};
  for (const line of body.toString('utf8').split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) {
      fields[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }

  return fields;
}

// A real WebSocket client: handshake, one masked text frame, and the echoed frame.
// Returns the status line of the handshake answer and the text that came back (empty when there was no 101).
export function webSocketEcho({ port, path, host = 'localhost', text = 'hello' }) {
  return new Promise((resolve, reject) => {
    const key = Buffer.from('smoke-test-key-16').toString('base64');
    const socket = net.connect(port, '127.0.0.1');
    let received = Buffer.alloc(0);
    let upgraded = false;
    let statusLine = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`WebSocket echo timed out (status: ${statusLine || 'none'})`));
    }, 10000);
    const finish = (result) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    socket.on('error', reject);
    socket.on('connect', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      const headerEnd = received.indexOf('\r\n\r\n');
      if (!upgraded && headerEnd >= 0) {
        const head = received.subarray(0, headerEnd).toString('utf8');
        statusLine = head.split('\r\n')[0];
        const expected = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        if (!statusLine.includes(' 101 ') || !head.includes(`Sec-WebSocket-Accept: ${expected}`)) {
          finish({ statusLine, echoed: '' });

          return;
        }

        upgraded = true;
        received = received.subarray(headerEnd + 4);
        const payload = Buffer.from(text);
        const mask = Buffer.from([1, 2, 3, 4]);
        const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
        socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
      }

      if (upgraded && received.length >= 2 && received.length >= 2 + (received[1] & 0x7f)) {
        finish({ statusLine, echoed: received.subarray(2, 2 + (received[1] & 0x7f)).toString('utf8') });
      }
    });
  });
}
