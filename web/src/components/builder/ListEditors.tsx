import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { Upstream } from '@/lib/engine.ts'

interface EditorProps<T> {
  id: string
  label: string
  value: T[]
  placeholder?: string
  invalid: boolean
  errorId?: string
  onChange(next: T[]): void
}

const codeInput = 'h-8 min-w-0 flex-1 basis-48 font-mono text-[12.5px]'

function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick(): void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <X />
    </Button>
  )
}

export function StringListEditor({
  id,
  label,
  value,
  placeholder,
  invalid,
  errorId,
  onChange,
}: EditorProps<string>) {
  return (
    <div className="flex flex-col gap-2" data-field={id}>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            id={index === 0 ? `opt-${id}` : undefined}
            className={codeInput}
            value={item}
            placeholder={placeholder}
            aria-label={`${label} ${index + 1}`}
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            onChange={(event) =>
              onChange(value.map((v, i) => (i === index ? event.target.value : v)))
            }
          />
          <RemoveButton
            label={`Remove ${label} ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        id={value.length === 0 ? `opt-${id}` : undefined}
        className="w-fit"
        aria-label={`Add ${label}`}
        onClick={() => onChange([...value, ''])}
      >
        <Plus /> Add
      </Button>
    </div>
  )
}

export function UpstreamEditor({
  id,
  label,
  value,
  placeholder,
  invalid,
  errorId,
  onChange,
}: EditorProps<Upstream>) {
  function update(index: number, patch: Partial<Upstream>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  return (
    <div className="flex flex-col gap-2" data-field={id}>
      {value.map((item, index) => (
        <div key={index} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Input
            id={index === 0 ? `opt-${id}` : undefined}
            className={codeInput}
            value={item.address}
            placeholder={placeholder}
            aria-label={`${label} ${index + 1} address`}
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            onChange={(event) => update(index, { address: event.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={item.backup}
              aria-label={`${label} ${index + 1} is a backup`}
              onCheckedChange={(checked) => update(index, { backup: checked })}
            />
            Backup
          </label>
          <RemoveButton
            label={`Remove ${label} ${index + 1}`}
            disabled={value.length === 1}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        aria-label={`Add ${label}`}
        onClick={() => onChange([...value, { address: '', backup: false }])}
      >
        <Plus /> Add upstream
      </Button>
    </div>
  )
}
