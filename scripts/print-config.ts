// Prints the config for a profile and target, with optional overrides, for quick inspection.
// Usage: node scripts/print-config.ts <profile> <target> '{"https":"manual"}'
import { generateConfig } from '../lib/render.ts';
import { defaultsFor, type Options, type Profile, type Target } from '../lib/options.ts';

const [profile = 'static', target = 'host', overrides = '{}'] = process.argv.slice(2);
const options: Options = { ...defaultsFor(profile as Profile, target as Target), ...JSON.parse(overrides) };

process.stdout.write(generateConfig(options));
