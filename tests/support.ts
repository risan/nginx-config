import { defaultsFor, type Options, type Profile, type Target } from '../lib/options.ts';
import { generateConfig } from '../lib/render.ts';

export interface Directive {
  name: string;
  args: string;
}

export interface Block {
  name: string;
  args: string;
  directives: Directive[];
  blocks: Block[];
}

// A small parser for the generated output. It understands comments, blocks, and directives
// that continue over several lines, which is all the renderer emits.
export function parseConfig(text: string): Block {
  const root: Block = { name: 'root', args: '', directives: [], blocks: [] };
  const stack: Block[] = [root];
  let pending = '';

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    pending = pending === '' ? line : `${pending} ${line}`;
    const current = stack[stack.length - 1]!;
    if (pending.endsWith('{')) {
      const [name = '', ...rest] = pending.slice(0, -1).trim().split(/\s+/);
      const block: Block = { name, args: rest.join(' '), directives: [], blocks: [] };
      current.blocks.push(block);
      stack.push(block);
      pending = '';
    } else if (pending === '}') {
      stack.pop();
      pending = '';
    } else if (pending.endsWith(';')) {
      const [name = '', ...rest] = pending.slice(0, -1).trim().split(/\s+/);
      current.directives.push({ name, args: rest.join(' ') });
      pending = '';
    }
  }

  return root;
}

export function find(block: Block, name: string): Block[] {
  return block.blocks.filter((child) => child.name === name);
}

export function http(config: string): Block {
  return find(parseConfig(config), 'http')[0]!;
}

export function servers(config: string): Block[] {
  return find(http(config), 'server');
}

export function directive(block: Block, name: string): string[] {
  return block.directives.filter((item) => item.name === name).map((item) => item.args);
}

export function serverNamed(config: string, name: string): Block {
  const match = servers(config).find((server) => directive(server, 'server_name').some((value) => value.split(' ').includes(name)));
  if (!match) {
    throw new Error(`no server for ${name}`);
  }

  return match;
}

// The server that runs the site: it has the health check. HTTPS configs also have a redirect server with the same name.
export function appServer(config: string, name = 'example.com'): Block {
  const match = servers(config).find(
    (server) => directive(server, 'server_name').some((value) => value.split(' ').includes(name)) && find(server, 'location').some((child) => child.args === '= /healthz')
  );
  if (!match) {
    throw new Error(`no app server for ${name}`);
  }

  return match;
}

export function redirectServer(config: string): Block {
  const match = servers(config).find((server) => find(server, 'location').some((child) => directive(child, 'return').some((value) => value.startsWith('308 '))));
  if (!match) {
    throw new Error('no HTTP redirect server');
  }

  return match;
}

export function aliasServer(config: string, name: string, tls: boolean): Block {
  const match = servers(config).find(
    (server) => directive(server, 'server_name')[0] === name && (directive(server, 'return').length > 0 || find(server, 'location').some((child) => directive(child, 'return').length > 0)) && directive(server, 'listen').some((value) => value.includes('ssl') === tls)
  );
  if (!match) {
    throw new Error(`no alias server for ${name}`);
  }

  return match;
}

export function location(server: Block, args: string): Block {
  const match = find(server, 'location').find((child) => child.args === args);
  if (!match) {
    throw new Error(`no location ${args}`);
  }

  return match;
}

export function configFor(profile: Profile, target: Target, overrides: Record<string, unknown> = {}): string {
  return generateConfig({ ...defaultsFor(profile, target), ...overrides } as Options);
}

export const MANUAL_TLS = {
  https: 'manual',
  certificatePath: '/etc/nginx/tls/fullchain.pem',
  certificateKeyPath: '/etc/nginx/tls/privkey.pem'
};

export const ACME = { https: 'acme', acmeEmail: 'admin@example.com' };
