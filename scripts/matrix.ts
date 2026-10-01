// Builds the option combinations that the nginx -t verification runs.
// Every profile, target, and HTTPS mode is covered, and every option value appears at least once.
import { OPTIONS, defaultsFor, validateOptions, type Options, type OptionDef, type Profile, type Target } from '../lib/options.ts';

export interface MatrixEntry {
  name: string;
  options: Options;
}

const PROFILES: Profile[] = ['static', 'spa', 'php', 'proxy'];
const TARGETS: Target[] = ['host', 'container'];
const HTTPS_MODES = ['off', 'manual', 'acme'] as const;

export const TEST_CERTIFICATE_DIRECTORY = '/tmp/nginx-config-tls';

const HTTPS_SETTINGS = {
  off: {},
  manual: {
    https: 'manual',
    certificatePath: `${TEST_CERTIFICATE_DIRECTORY}/fullchain.pem`,
    certificateKeyPath: `${TEST_CERTIFICATE_DIRECTORY}/privkey.pem`
  },
  acme: { https: 'acme', acmeEmail: 'admin@example.com' }
} as const;

// Settings that an option needs before it has any effect.
const PREREQUISITES: Record<string, Record<string, unknown>> = {
  gzipLevel: { gzip: true },
  cspReportOnly: { contentSecurityPolicy: "default-src 'self'" },
  rateLimitRate: { rateLimit: 'on' },
  rateLimitBurst: { rateLimit: 'on' },
  realIpHeader: { realIp: 'custom', trustedProxies: ['203.0.113.0/24', '2001:db8::/32'] },
  trustedProxies: { realIp: 'custom' },
  realIp: { trustedProxies: ['203.0.113.0/24'] },
  upstreamTls: { upstreamTlsName: 'app.internal' },
  upstreamTlsName: { upstreamTls: true },
  loadBalancing: { upstreams: [{ address: '127.0.0.1:3000', backup: false }, { address: '127.0.0.1:3001', backup: false }] },
  https: HTTPS_SETTINGS.manual,
  httpsPort: HTTPS_SETTINGS.manual,
  publicHttpsPort: HTTPS_SETTINGS.manual,
  resolver: { https: 'acme', acmeEmail: 'admin@example.com' }
};

const SAMPLE_VALUES: Record<string, unknown[]> = {
  serverName: ['example.com', 'app.example.co.uk', 'localhost'],
  documentRoot: ['/srv/site'],
  upstreams: [
    [{ address: '127.0.0.1:3000', backup: false }],
    [{ address: 'app:3000', backup: false }],
    [{ address: '[::1]:3000', backup: false }],
    [{ address: 'unix:/run/app.sock', backup: false }],
    [{ address: '10.0.0.5:3000', backup: false }, { address: 'app-2:3000', backup: true }]
  ],
  certificatePath: [`${TEST_CERTIFICATE_DIRECTORY}/fullchain.pem`],
  certificateKeyPath: [`${TEST_CERTIFICATE_DIRECTORY}/privkey.pem`],
  acmeEmail: ['admin@example.com'],
  immutablePaths: [['/assets/'], ['/assets/', '/build/assets/', '/_next/static/']],
  clientMaxBodySize: ['512k', '100m'],
  contentSecurityPolicy: ["default-src 'self'; img-src 'self' data:; frame-ancestors 'none'"],
  trustedProxies: [['203.0.113.7'], ['203.0.113.0/24', '2001:db8::/32']],
  websocketPath: ['/ws/', '/socket.io'],
  streamingPath: ['/events/'],
  upstreamTlsName: ['app.internal'],
  workerUser: ['nginx'],
  resolver: ['127.0.0.11', '1.1.1.1 8.8.8.8', '2606:4700:4700::1111']
};

function valuesFor(spec: OptionDef): unknown[] {
  if (spec.kind === 'select') {
    return spec.choices!.map((choice) => choice.value);
  }
  if (spec.kind === 'toggle') {
    return [true, false];
  }
  if (spec.kind === 'number') {
    return [spec.min!, spec.max!];
  }

  return SAMPLE_VALUES[spec.key] ?? [];
}

function baseOptions(profile: Profile, target: Target, https: (typeof HTTPS_MODES)[number]): Options {
  return { ...defaultsFor(profile, target), ...HTTPS_SETTINGS[https] } as Options;
}

function slug(value: unknown): string {
  return JSON.stringify(value).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function featureEntries(): MatrixEntry[] {
  const entries: MatrixEntry[] = [];
  for (const spec of OPTIONS) {
    for (const value of valuesFor(spec)) {
      const candidate = findBase(spec, value);
      if (!candidate) {
        throw new Error(`No valid configuration found to test ${spec.key}=${JSON.stringify(value)}`);
      }

      entries.push({ name: `option-${spec.key}-${slug(value)}-${candidate.label}`, options: candidate.options });
    }
  }

  return entries;
}

// Picks the first profile, target, and HTTPS mode where the option applies and the result is valid.
function findBase(spec: OptionDef, value: unknown): { label: string; options: Options } | null {
  const settings = { ...(PREREQUISITES[spec.key] ?? {}), [spec.key]: value };
  for (const https of ['off', 'manual', 'acme'] as const) {
    for (const profile of ['proxy', 'php', 'spa', 'static'] as const) {
      for (const target of TARGETS) {
        const options = { ...baseOptions(profile, target, https), ...settings } as Options;
        if (validateOptions(options).valid && spec.appliesTo(options)) {
          return { label: `${profile}-${target}-${https}`, options };
        }
      }
    }
  }

  return null;
}

function combinationEntries(): MatrixEntry[] {
  const proxyFull = {
    https: 'acme',
    acmeEmail: 'admin@example.com',
    http3: true,
    realIp: 'cloudflare',
    wwwRedirect: 'to-apex',
    upstreams: [{ address: 'app-1:3000', backup: false }, { address: 'app-2:3000', backup: false }, { address: 'app-3:3000', backup: true }],
    loadBalancing: 'least-conn',
    websocketPath: '/ws/',
    streamingPath: '/events/',
    proxyCache: true,
    rateLimit: 'on',
    connLimit: 20,
    statusEndpoint: true,
    permissionsPolicy: true,
    hsts: 'subdomains',
    contentSecurityPolicy: "default-src 'self'"
  };

  return [
    { name: 'combo-proxy-full-host', options: { ...defaultsFor('proxy', 'host'), ...proxyFull } as Options },
    { name: 'combo-proxy-full-container', options: { ...defaultsFor('proxy', 'container'), ...proxyFull } as Options },
    {
      name: 'combo-php-full-host',
      options: {
        ...baseOptions('php', 'host', 'manual'),
        upstreams: [{ address: '127.0.0.1:9000', backup: false }, { address: '127.0.0.1:9001', backup: true }],
        fastcgiCache: true,
        rateLimit: 'dry-run',
        openFileCache: true,
        accessLogBuffer: true,
        http3: true,
        hsts: 'preload',
        wwwRedirect: 'to-www'
      } as Options
    },
    {
      name: 'combo-static-full-container',
      options: { ...baseOptions('static', 'container', 'manual'), http3: true, ipv6: true, wwwRedirect: 'to-www', openFileCache: true } as Options
    },
    {
      name: 'combo-static-proxy-protocol-http-alias',
      options: { ...baseOptions('static', 'container', 'off'), realIp: 'custom', realIpHeader: 'proxy_protocol', trustedProxies: ['10.0.0.0/8'], wwwRedirect: 'to-www' } as Options
    },
    {
      name: 'combo-proxy-http-alias-trusted-proxy',
      options: { ...baseOptions('proxy', 'host', 'off'), realIp: 'cloudflare', wwwRedirect: 'to-apex', publicHttpPort: 8000, publicHttpsPort: 8001 } as Options
    },
    {
      name: 'combo-spa-proxy-protocol',
      options: { ...baseOptions('spa', 'host', 'manual'), realIp: 'custom', realIpHeader: 'proxy_protocol', trustedProxies: ['10.0.0.0/8'] } as Options
    }
  ];
}

// IPv4 and IPv6 QUIC listeners for the reject, app, and alias servers.
function quicEntries(): MatrixEntry[] {
  return [true, false].flatMap((ipv6) =>
    ['off', 'to-apex'].map((wwwRedirect) => ({
      name: `quic-ipv6-${ipv6}-www-${wwwRedirect}`,
      options: { ...baseOptions('static', 'host', 'manual'), http3: true, ipv6, wwwRedirect } as Options
    }))
  );
}

export function buildMatrix(): MatrixEntry[] {
  const base = PROFILES.flatMap((profile) =>
    TARGETS.flatMap((target) =>
      HTTPS_MODES.map((https) => ({ name: `base-${profile}-${target}-https-${https}`, options: baseOptions(profile, target, https) }))
    )
  );
  const entries = [...base, ...featureEntries(), ...combinationEntries(), ...quicEntries()];
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = JSON.stringify(entry.options);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}
