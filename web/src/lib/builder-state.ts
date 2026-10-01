import {
  defaultsFor,
  generateConfig,
  validateOptions,
  type Options,
  type Profile,
  type Target,
} from './engine.ts'
import { switchPreset } from './state.ts'

export interface BuilderState {
  options: Options
  errors: Record<string, string>
  // The last options that passed validation, and the config rendered from them.
  shown: { options: Options; config: string }
  // What produced this state. Only the user's own edits get the changed-line marker.
  source: BuilderAction['type']
}

export type BuilderAction =
  | { type: 'set'; key: string; value: Options[string] }
  | { type: 'preset'; profile: Profile; target: Target }
  | { type: 'restore'; options: Options }

function evaluate(
  options: Options,
  previous: BuilderState['shown'] | null,
  source: BuilderAction['type'],
): BuilderState {
  const validation = validateOptions(options)
  if (validation.valid && validation.options !== null) {
    const shown = { options: validation.options, config: generateConfig(validation.options) }

    return { options, errors: validation.errors, shown, source }
  }

  return {
    options,
    errors: validation.errors,
    shown: previous ?? { options, config: generateConfig(options) },
    source,
  }
}

export function initialBuilderState(): BuilderState {
  return evaluate(defaultsFor('static', 'host'), null, 'restore')
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'set':
      return evaluate({ ...state.options, [action.key]: action.value }, state.shown, 'set')
    case 'preset':
      return evaluate(
        switchPreset(state.options, action.profile, action.target),
        state.shown,
        'preset',
      )
    case 'restore':
      return evaluate(action.options, state.shown, 'restore')
  }
}
