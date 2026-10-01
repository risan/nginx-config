import {
  defaultsFor,
  PROFILES,
  TARGETS,
  type Options,
  type Profile,
  type Target,
} from '../src/lib/engine.ts'

// Turns on every optional feature so that conditional options become applicable.
const EVERYTHING_ON: Record<string, Options[string]> = {
  http3: true,
  hsts: 'preload',
  gzip: true,
  openFileCache: true,
  proxyCache: true,
  fastcgiCache: true,
  accessLogBuffer: true,
  contentSecurityPolicy: "default-src 'self'",
  cspReportOnly: true,
  permissionsPolicy: true,
  rateLimit: 'on',
  connLimit: 20,
  realIp: 'custom',
  trustedProxies: ['10.0.0.0/8'],
  realIpHeader: 'X-Forwarded-For',
  websocketPath: '/ws/',
  streamingPath: '/events/',
  upstreamTls: true,
  upstreamTlsName: 'app.internal',
  wwwRedirect: 'to-apex',
  statusEndpoint: true,
  immutablePaths: ['/assets/'],
  upstreams: [
    { address: 'app1.internal:3000', backup: false },
    { address: 'app2.internal:3000', backup: true },
  ],
}

export interface NamedState {
  name: string
  options: Options
}

// Every profile and target, with HTTPS off, with certificate files, and with ACME, each
// with and without the optional features. Together they make every option applicable
// at least once.
export function allStates(): NamedState[] {
  const states: NamedState[] = []
  for (const profile of PROFILES.map((p) => p.id as Profile)) {
    for (const target of TARGETS.map((t) => t.id as Target)) {
      for (const https of ['off', 'manual', 'acme']) {
        for (const full of [false, true]) {
          const options = defaultsFor(profile, target)
          options.https = https
          if (https === 'acme') {
            options.acmeEmail = 'admin@example.com'
          }
          if (full) {
            Object.assign(options, EVERYTHING_ON)
          }
          states.push({
            name: `${profile}/${target}/https=${https}/${full ? 'full' : 'default'}`,
            options,
          })
        }
      }
    }
  }

  return states
}
