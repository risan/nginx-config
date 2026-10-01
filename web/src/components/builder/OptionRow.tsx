import { ExternalLink, Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { OptionDef, Options, Upstream } from '@/lib/engine.ts'

import { StringListEditor, UpstreamEditor } from './ListEditors'

interface OptionRowProps {
  def: OptionDef
  options: Options
  error?: string
  onChange(key: string, value: Options[string]): void
}

// Short choice lists read best as a segmented control. Long labels would overflow a
// phone screen, so they use a select instead.
const SEGMENT_MAX_CHOICES = 4
const SEGMENT_MAX_CHARS = 34

function Control({ def, options, error, onChange }: OptionRowProps) {
  const value = options[def.key]
  const id = `opt-${def.key}`
  const errorId = error === undefined ? undefined : `err-${def.key}`
  const invalid = error !== undefined

  switch (def.kind) {
    case 'select': {
      const choices = def.choices ?? []
      const chars = choices.reduce((sum, choice) => sum + choice.label.length, 0)
      if (choices.length <= SEGMENT_MAX_CHOICES && chars <= SEGMENT_MAX_CHARS) {
        return (
          <ToggleGroup
            id={id}
            type="single"
            variant="outline"
            size="sm"
            value={String(value)}
            aria-label={def.label}
            onValueChange={(next) => {
              if (next !== '') {
                onChange(def.key, next)
              }
            }}
          >
            {choices.map((choice) => (
              <ToggleGroupItem
                key={choice.value}
                value={choice.value}
                className="h-8 text-[13px] shadow-none data-[state=on]:border-primary/60 data-[state=on]:font-medium"
              >
                {choice.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )
      }

      return (
        <Select
          value={String(value)}
          onValueChange={(next) => {
            // Radix reports '' when its hidden native select re-syncs; that is not a choice.
            if (next !== '') {
              onChange(def.key, next)
            }
          }}
        >
          <SelectTrigger
            id={id}
            size="sm"
            className="h-8 w-full max-w-sm shadow-none"
            aria-label={def.label}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case 'toggle':
      return (
        <Switch
          id={id}
          checked={value === true}
          aria-label={def.label}
          onCheckedChange={(checked) => onChange(def.key, checked)}
        />
      )
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            className="h-8 w-32 font-mono text-[12.5px] shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            min={def.min}
            max={def.max}
            value={String(value ?? '')}
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            onChange={(event) => {
              const raw = event.target.value
              onChange(def.key, raw === '' ? '' : Number(raw))
            }}
          />
          {def.unit === undefined ? null : (
            <span className="text-xs text-muted-foreground">{def.unit}</span>
          )}
        </div>
      )
    case 'list':
      return (
        <StringListEditor
          id={def.key}
          label={def.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          placeholder={def.placeholder}
          invalid={invalid}
          errorId={errorId}
          onChange={(next) => onChange(def.key, next)}
        />
      )
    case 'upstreams':
      return (
        <UpstreamEditor
          id={def.key}
          label={def.label}
          value={Array.isArray(value) ? (value as Upstream[]) : []}
          placeholder={def.placeholder}
          invalid={invalid}
          errorId={errorId}
          onChange={(next) => onChange(def.key, next)}
        />
      )
    case 'text':
      return (
        <Input
          id={id}
          className="h-8 max-w-md font-mono text-[12.5px] shadow-none"
          value={String(value ?? '')}
          placeholder={def.placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          onChange={(event) => onChange(def.key, event.target.value)}
        />
      )
  }
}

export function OptionRow(props: OptionRowProps) {
  const { def, options, error } = props
  const selected = def.choices?.find((choice) => choice.value === options[def.key])

  return (
    <div
      id={`row-${def.key}`}
      className="grid gap-x-4 gap-y-1 border-b border-border py-1.5 last:border-b-0 sm:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <div className="flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-1">
        <Label htmlFor={`opt-${def.key}`} className="text-[13px] leading-tight font-medium">
          {def.label}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Why: ${def.label}`}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {def.why}
          </TooltipContent>
        </Tooltip>
        {def.docs === undefined ? null : (
          <a
            href={def.docs}
            target="_blank"
            rel="noreferrer"
            aria-label={`${def.label} documentation`}
            className="rounded-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
        {def.experimental === true ? (
          <Badge variant="outline" className="h-4 rounded-sm px-1 text-[10px] text-warning">
            Experimental
          </Badge>
        ) : null}
        {def.advanced === true && def.group !== 'advanced' ? (
          <Badge
            variant="outline"
            className="h-4 rounded-sm px-1 text-[10px] text-muted-foreground"
          >
            Advanced
          </Badge>
        ) : null}
      </div>
      <div className="min-w-0">
        <div data-control className="flex min-h-8 items-center">
          <Control {...props} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {def.help}
          {selected?.help === undefined ? '' : ` ${selected.help}`}
        </p>
        {error === undefined ? null : (
          <p
            id={`err-${def.key}`}
            role="alert"
            className="mt-1 text-xs font-medium text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
