// The only module UI code imports the option schema and renderer from. The shared
// modules live in the repository root so the CLI, tests, and this app use one renderer.
export {
  derivedDefaults,
  GROUPS,
  OPTIONS,
  PROFILES,
  TARGETS,
  validateOptions,
  type Choice,
  type GroupId,
  type OptionDef,
  type OptionKind,
  type Options,
  type Profile,
  type Target,
  type Upstream,
} from '../../../lib/options.ts'
import { defaultsFor as resolvedDefaultsFor } from '../../../lib/options.ts'
import type { Options, Profile, Target } from '../../../lib/options.ts'

// The UI edits options by key, so it uses the loosely typed Options view of the defaults.
export function defaultsFor(profile: Profile, target: Target): Options {
  return { ...resolvedDefaultsFor(profile, target) }
}
export { deploySteps, generateConfig, warnings } from '../../../lib/render.ts'
export { NGINX_VERSION } from '../../../lib/version.ts'
