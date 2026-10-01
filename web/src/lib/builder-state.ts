import {
  defaultsFor,
  generateConfig,
  validateOptions,
  type Options,
  type Profile,
  type Target,
} from './engine.ts'
import { deriveDefaults, switchPreset, withoutInapplicable } from './state.ts'

export interface BuilderState {
  // Everything the user typed, including values of fields that are currently hidden.
  options: Options
  // Keys the user changed. Untouched domain-dependent defaults follow the domain.
  edited: ReadonlySet<string>
  errors: Record<string, string>
  // The last options that passed validation, and the config rendered from them.
  shown: { options: Options; config: string }
  // What produced this state. Only the user's own edits get the changed-line marker.
  source: BuilderAction['type']
}

export type BuilderAction =
  | { type: 'set'; key: string; value: Options[string] }
  | { type: 'preset'; profile: Profile; target: Target }
  | { type: 'restore'; options: Options; edited: ReadonlySet<string> }

function evaluate(
  options: Options,
  edited: ReadonlySet<string>,
  previous: BuilderState['shown'] | null,
  source: BuilderAction['type'],
): BuilderState {
  // Validate only the fields that apply, so a hidden field cannot block Copy and Download.
  const validation = validateOptions(withoutInapplicable(options))
  if (validation.valid && validation.options !== null) {
    const shown = { options: validation.options, config: generateConfig(validation.options) }

    return { options, edited, errors: validation.errors, shown, source }
  }

  return {
    options,
    edited,
    errors: validation.errors,
    shown: previous ?? { options, config: generateConfig(options) },
    source,
  }
}

export function initialBuilderState(): BuilderState {
  return evaluate(defaultsFor('static', 'host'), new Set(), null, 'restore')
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'set': {
      const edited = new Set(state.edited).add(action.key)
      const options = deriveDefaults({ ...state.options, [action.key]: action.value }, edited)

      return evaluate(options, edited, state.shown, 'set')
    }
    case 'preset': {
      const next = switchPreset(state.options, state.edited, action.profile, action.target)

      return evaluate(next.options, next.edited, state.shown, 'preset')
    }
    case 'restore':
      return evaluate(action.options, action.edited, state.shown, 'restore')
  }
}
