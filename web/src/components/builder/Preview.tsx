import { AlertTriangle, Check, Copy, Download, Info, Link2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { tokenizeLine, type TokenType } from '@/lib/tokenize'
import { cn } from '@/lib/utils'
import type { deploySteps, warnings } from '@/lib/engine.ts'

type Steps = ReturnType<typeof deploySteps>
type Warnings = ReturnType<typeof warnings>

export interface PreviewProps {
  config: string
  steps: Steps
  notices: Warnings
  errorCount: number
  markChanges: boolean
  errorFields: { key: string; label: string }[]
  onCopy(text: string): void
  onDownload(): void
  onShare(): void
  onFocusField(key: string): void
  className?: string
}

const TOKEN_CLASS: Record<TokenType, string> = {
  comment: 'text-tok-comment italic',
  directive: 'text-tok-directive font-medium',
  variable: 'text-tok-variable',
  string: 'text-tok-string',
  number: 'text-tok-number',
  punct: 'text-tok-punct',
  text: '',
}

const CHANGE_MARKER_MS = 1500

// Lines that were not in the previous output, counted as a multiset so a repeated
// line such as "}" is only marked when it was added.
function changedLineIndexes(previous: string[], next: string[]): Set<number> {
  const counts = new Map<string, number>()
  for (const line of previous) {
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }

  const changed = new Set<number>()
  next.forEach((line, index) => {
    const remaining = counts.get(line) ?? 0
    if (remaining > 0) {
      counts.set(line, remaining - 1)
    } else if (line.trim() !== '') {
      changed.add(index)
    }
  })

  return changed
}

function CodeView({ lines, changed }: { lines: string[]; changed: Set<number> }) {
  const gutterWidth = `${String(lines.length).length + 1}ch`

  return (
    <div className="py-2 font-mono text-[12.5px] leading-[1.55]" data-testid="config-code">
      {lines.map((line, index) => (
        <div key={index} className={cn('code-line', changed.has(index) && 'is-changed')}>
          <span
            aria-hidden="true"
            className="shrink-0 pr-3 pl-3 text-right text-gutter select-none"
            style={{ minWidth: `calc(${gutterWidth} + 1.5rem)` }}
          >
            {index + 1}
          </span>
          <span className="pr-4 whitespace-pre">
            {tokenizeLine(line).map((token, i) => (
              <span key={i} className={TOKEN_CLASS[token.type]}>
                {token.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function useChangedLines(lines: string[], enabled: boolean): Set<number> {
  const previous = useRef<string[] | null>(null)
  const [changed, setChanged] = useState<Set<number>>(new Set())

  useEffect(() => {
    const before = previous.current
    previous.current = lines
    if (
      !enabled ||
      before === null ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const marked = changedLineIndexes(before, lines)
    if (marked.size === 0 || marked.size > lines.length * 0.6) {
      return
    }

    setChanged(marked)
    const timer = window.setTimeout(() => setChanged(new Set()), CHANGE_MARKER_MS)

    return () => window.clearTimeout(timer)
  }, [lines, enabled])

  return changed
}

export function Preview(props: PreviewProps) {
  const { config, steps, notices, errorCount, errorFields, markChanges, className } = props
  const lines = useMemo(() => config.replace(/\n$/, '').split('\n'), [config])
  const changed = useChangedLines(lines, markChanges)
  const [copied, setCopied] = useState(false)
  const blocked = errorCount > 0

  function copy() {
    props.onCopy(config)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('flex min-h-0 flex-col rounded-md border border-border bg-card', className)}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="font-mono text-[12.5px] font-medium">nginx.conf</span>
        <span className="text-xs text-muted-foreground" data-testid="line-count">
          {lines.length} lines
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shadow-none"
            disabled={blocked}
            onClick={copy}
          >
            {copied ? <Check /> : <Copy />} Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shadow-none"
            disabled={blocked}
            onClick={props.onDownload}
          >
            <Download /> Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shadow-none"
            onClick={props.onShare}
          >
            <Link2 /> Share
          </Button>
        </div>
      </div>
      {blocked ? (
        <div
          role="status"
          className="shrink-0 border-b border-border bg-warning-soft px-3 py-1.5 text-xs text-warning"
        >
          <span className="font-medium">
            Fix {errorCount} {errorCount === 1 ? 'error' : 'errors'} to update.
          </span>{' '}
          Showing the last valid config.{' '}
          {errorFields.map((field, index) => (
            <span key={field.key}>
              {index > 0 ? ', ' : ''}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => props.onFocusField(field.key)}
              >
                {field.label}
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Tabs defaultValue="config" className="min-h-0 flex-1 gap-0">
        <TabsList
          variant="line"
          className="h-9 w-full justify-start rounded-none border-b border-border px-2"
        >
          <TabsTrigger value="config" className="flex-none">
            nginx.conf
          </TabsTrigger>
          <TabsTrigger value="deploy" className="flex-none">
            Deploy
          </TabsTrigger>
          <TabsTrigger value="warnings" className="flex-none">
            Warnings ({notices.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="config"
          className="min-h-0 flex-1 overflow-auto bg-code-bg"
          tabIndex={0}
        >
          <CodeView lines={lines} changed={changed} />
        </TabsContent>
        <TabsContent value="deploy" className="min-h-0 flex-1 overflow-auto p-3">
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border border-border text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{step.title}</p>
                  {step.note === undefined ? null : (
                    <p className="text-xs text-muted-foreground">{step.note}</p>
                  )}
                  {step.command === undefined ? null : (
                    <div className="mt-1 flex items-start gap-1 rounded-sm border border-border bg-code-bg">
                      <pre className="min-w-0 flex-1 overflow-x-auto px-2 py-1.5 font-mono text-[12.5px]">
                        {step.command}
                      </pre>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copy command: ${step.title}`}
                        onClick={() => props.onCopy(step.command ?? '')}
                      >
                        <Copy />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </TabsContent>
        <TabsContent value="warnings" className="min-h-0 flex-1 overflow-auto p-3">
          {notices.length === 0 ? (
            <p className="text-xs text-muted-foreground">No warnings for these options.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notices.map((notice, index) => {
                const Icon = notice.level === 'warn' ? AlertTriangle : Info
                return (
                  <li key={index} className="flex items-start gap-2 text-[13px]">
                    <Icon
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        notice.level === 'warn' ? 'text-warning' : 'text-muted-foreground',
                      )}
                    />
                    {notice.key === undefined ? (
                      <span>{notice.message}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => props.onFocusField(notice.key ?? '')}
                      >
                        {notice.message}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
