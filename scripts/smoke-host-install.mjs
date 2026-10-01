#!/usr/bin/env node

// Runs the host install and renewal-hook commands that deploySteps prints, in a Debian container with
// GNU install and a certbot-style live folder (symlinks into archive/). A certificate-only or key-only
// override must install only the overridden file and leave certbot's live symlinks alone.
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { deploySteps } from '../lib/render.ts';
import { defaultsFor } from '../lib/options.ts';
import { assert, createSmoke, runSmoke } from './smoke-kit.mjs';

const IMAGE = process.env.HOST_INSTALL_IMAGE ?? 'debian:stable-slim';
const smoke = createSmoke('host-install');

function fakeLiveFolder(root) {
  const live = join(root, 'etc', 'letsencrypt', 'live', 'example.com');
  const archive = join(root, 'etc', 'letsencrypt', 'archive', 'example.com');
  mkdirSync(live, { recursive: true });
  mkdirSync(archive, { recursive: true });
  writeFileSync(join(archive, 'fullchain1.pem'), 'CERTIFICATE\n');
  writeFileSync(join(archive, 'privkey1.pem'), 'KEY\n');
  symlinkSync('../../archive/example.com/fullchain1.pem', join(live, 'fullchain.pem'));
  symlinkSync('../../archive/example.com/privkey1.pem', join(live, 'privkey.pem'));
}

await runSmoke(smoke, async () => {
  const cases = [
    { name: 'certificate only', overrides: { certificatePath: '/srv/site.crt' }, installed: ['/srv/site.crt'] },
    { name: 'key only', overrides: { certificateKeyPath: '/srv/site.key' }, installed: ['/srv/site.key'] },
    { name: 'both', overrides: { certificatePath: '/srv/a.crt', certificateKeyPath: '/srv/a.key' }, installed: ['/srv/a.crt', '/srv/a.key'] }
  ];
  for (const { name, overrides, installed } of cases) {
    const root = join(smoke.workdir, name.replaceAll(' ', '-'));
    fakeLiveFolder(root);
    const steps = deploySteps({ ...defaultsFor('static', 'host'), https: 'manual', ...overrides });
    const install = steps.find((step) => step.title.startsWith('Install the certificate')).command;
    const hook = /--deploy-hook "(.*) && systemctl reload nginx"/.exec(steps.find((step) => step.title.startsWith('Renew')).command)[1];
    // The container has no sudo and no systemd. The printed commands run as they are, without the sudo prefix.
    const script = [
      'set -e',
      install.replaceAll('sudo ', ''),
      // The renewal hook runs after certbot has swapped the archive files. It must work a second time too.
      hook,
      'test -L /etc/letsencrypt/live/example.com/fullchain.pem',
      'test -L /etc/letsencrypt/live/example.com/privkey.pem',
      ...installed.map((path) => `test -s ${path} && test ! -L ${path}`)
    ].join('\n');
    smoke.docker(['run', '--rm', '--user', '0', '--mount', `type=bind,src=${join(root, 'etc')},dst=/etc/letsencrypt-parent`, '--entrypoint', 'sh', IMAGE, '-c', `rm -rf /etc/letsencrypt && ln -s /etc/letsencrypt-parent/letsencrypt /etc/letsencrypt && mkdir -p /srv && ${script.replaceAll('\n', ' && ')}`]);
    assert(true, name);
  }

  process.stdout.write('PASS the host install and renewal-hook commands keep certbot live symlinks and install only overridden files\n');
});
