import { ChevronDown, ChevronRight, Eye } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Toaster } from '@/components/ui/sonner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  deploySteps,
  GROUPS,
  OPTIONS,
  PROFILES,
  TARGETS,
  warnings,
  type GroupId,
  type Options,
  type Profile,
  type Target,
} from '@/lib/engine.ts'
import { builderReducer, initialBuilderState } from '@/lib/builder-state'
import { useIsDark } from '@/lib/theme'
import { groupErrors } from '@/lib/errors'
import {
  decodeShareHash,
  encodeShareHash,
  groupLabel,
  isShareHashTooLong,
  MAX_HASH_LENGTH,
  visibleOptions,
} from '@/lib/state'
import { cn } from '@/lib/utils'

import { OptionRow } from './OptionRow'
import { Preview } from './Preview'

// The schema labels are written for the form and the reference ("Single-page app");
// the control strip needs the short forms to fit a phone.
const SHORT_LABELS: Record<string, string> = {
  static: 'Static',
  spa: 'SPA',
  php: 'PHP',
  proxy: 'Reverse proxy',
  host: 'Server / VM',
  container: 'Container',
}

const SEGMENT_ITEM =
  'h-7 px-2.5 text-[13px] shadow-none data-[state=on]:border-primary/60 data-[state=on]:font-medium'

function Segmented<T extends string>(props: {
  label: string
  shortLabel: string
  value: T
  items: { id: T; label: string; description: string }[]
  onChange(value: T): void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted-foreground sm:w-auto">
        <span className="sm:hidden">{props.shortLabel}</span>
        <span className="hidden sm:inline">{props.label}</span>
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={props.value}
        aria-label={props.label}
        onValueChange={(next) => {
          if (next !== '') {
            props.onChange(next as T)
          }
        }}
      >
        {props.items.map((item) => (
          <ToggleGroupItem
            key={item.id}
            value={item.id}
            title={item.description}
            className={SEGMENT_ITEM}
          >
            {SHORT_LABELS[item.id] ?? item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export default function Builder() {
  const [state, dispatch] = useReducer(builderReducer, undefined, initialBuilderState)
  const [advancedOpen, setAdvancedOpen] = useState<Partial<Record<GroupId, boolean>>>({})
  const [sheetOpen, setSheetOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<GroupId>('site')
  const dark = useIsDark()
  const { options, errors, shown } = state
  const errorCount = Object.keys(errors).length

  useEffect(() => {
    // The share link lives in the URL, which only exists in the browser. Restoring it
    // after hydration keeps the server-rendered markup identical to the first client render.
    const restored = decodeShareHash(window.location.hash)
    if (restored !== null) {
      // oxlint-disable-next-line react/set-state-in-effect
      dispatch({ type: 'restore', options: restored.options, edited: restored.edited })
    }
  }, [])

  const steps = useMemo(() => deploySteps(shown.options), [shown.options])
  const notices = useMemo(() => warnings(shown.options), [shown.options])
  const lineCount = shown.config.replace(/\n$/, '').split('\n').length

  const sections = GROUPS.map((group) => ({
    ...group,
    label: groupLabel(group.id, options.profile),
    visible: visibleOptions(options, group.id),
  })).filter((section) => section.visible.length > 0)

  const grouped = groupErrors(errors)
  const visibleKeys = new Set(sections.flatMap((section) => section.visible.map((def) => def.key)))
  const errorFields = Object.keys(errors).map((key) => {
    const match = /^([A-Za-z0-9_]+)(?:\.(\d+))?/.exec(key)
    const field = match?.[1] ?? key
    const index = match?.[2] === undefined ? undefined : Number(match[2])
    const label = OPTIONS.find((def) => def.key === field)?.label ?? field

    return { key: field, index, label: index === undefined ? label : `${label} ${index + 1}` }
  })
  // Errors that point at a field the form does not show, such as a conflict between two
  // options. They get a message of their own so the builder is never blocked silently.
  const orphanErrors = [...grouped]
    .filter(([field]) => !visibleKeys.has(field))
    .flatMap(([field, entry]) =>
      [entry.own, ...Object.values(entry.items)].map((message) => ({ field, message })),
    )

  function setValue(key: string, value: Options[string]) {
    // A section that an error opened must stay open after the edit clears that error,
    // so fields do not vanish under the cursor.
    const opened = sections
      .filter((section) =>
        section.visible.some((def) => def.advanced === true && grouped.has(def.key)),
      )
      .map((section) => section.id)
    const editedGroup = OPTIONS.find((def) => def.key === key && def.advanced === true)?.group
    setAdvancedOpen((current) => {
      const next = { ...current }
      for (const id of [...opened, ...(editedGroup === undefined ? [] : [editedGroup])]) {
        next[id] = true
      }

      return next
    })
    dispatch({ type: 'set', key, value })
  }

  function changePreset(profile: Profile, target: Target) {
    dispatch({ type: 'preset', profile, target })
  }

  const focusField = useCallback(
    (key: string, index?: number) => {
      const def = OPTIONS.find((candidate) => candidate.key === key)
      setSheetOpen(false)
      if (def !== undefined) {
        setAdvancedOpen((current) => ({ ...current, [def.group]: true }))
      }
      window.setTimeout(() => {
        const row = document.getElementById(`row-${key}`)
        const target =
          row === null
            ? document.getElementById('form-errors')
            : index === undefined
              ? row.querySelector<HTMLElement>(
                  '[data-control] :is(input, button, [role="radio"], [role="switch"])',
                )
              : row.querySelector<HTMLElement>(`[data-item="${index}"] input`)
        target?.scrollIntoView({ block: 'center' })
        target?.focus()
      }, 50)
    },
    [setSheetOpen],
  )

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.')
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([shown.config], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'nginx.conf'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function share() {
    const hash = encodeShareHash(options, state.edited)
    if (isShareHashTooLong(hash)) {
      toast.error(
        `This configuration is too large for a share link (${hash.length.toLocaleString('en-US')} of ${MAX_HASH_LENGTH.toLocaleString('en-US')} characters). Shorten long values such as the Content-Security-Policy or path lists, or download the config instead.`,
      )

      return
    }

    window.history.replaceState(null, '', hash)
    await copyText(`${window.location.origin}${window.location.pathname}${hash}`)
  }

  const sectionIds = sections.map((s) => s.id).join(',')
  useEffect(() => {
    const targets = sectionIds
      .split(',')
      .map((id) => document.getElementById(`section-${id}`))
      .filter((el) => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top !== undefined) {
          setActiveGroup(top.target.id.replace('section-', '') as GroupId)
        }
      },
      { rootMargin: '-110px 0px -65% 0px' },
    )
    targets.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [sectionIds])

  const errorGroups = new Set(
    errorFields.map((field) => OPTIONS.find((def) => def.key === field.key)?.group),
  )

  const preview = (className?: string) => (
    <Preview
      className={className}
      config={shown.config}
      steps={steps}
      notices={notices}
      errorCount={errorCount}
      markChanges={state.source === 'set'}
      errorFields={errorFields}
      onCopy={copyText}
      onDownload={download}
      onShare={share}
      onFocusField={focusField}
    />
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto w-full max-w-[1680px]">
        <div className="z-20 flex flex-col gap-2 border-b border-border bg-background px-4 py-2 sm:sticky sm:top-11 sm:h-12 sm:flex-row sm:items-center sm:gap-6 sm:py-0">
          <Segmented
            label="What are you serving?"
            shortLabel="Serving"
            value={options.profile}
            items={PROFILES}
            onChange={(profile) => changePreset(profile, options.target)}
          />
          <Segmented
            label="Where does it run?"
            shortLabel="Runs on"
            value={options.target}
            items={TARGETS}
            onChange={(target) => changePreset(options.profile, target)}
          />
        </div>

        <nav
          aria-label="Sections"
          className="z-10 flex flex-wrap gap-x-1 border-b border-border bg-background px-3 py-1 sm:sticky sm:top-[92px] sm:px-4 sm:py-1.5 xl:hidden"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {section.label}
              {errorGroups.has(section.id) ? (
                <span
                  className="size-1.5 rounded-full bg-destructive"
                  role="img"
                  aria-label="has errors"
                />
              ) : null}
            </a>
          ))}
        </nav>

        <div className="grid gap-4 px-4 py-4 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,45%)] lg:pb-4 xl:grid-cols-[10rem_minmax(0,1fr)_minmax(0,45%)]">
          <nav aria-label="Section navigation" className="sticky top-[108px] hidden h-fit xl:block">
            <ul className="flex flex-col gap-0.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#section-${section.id}`}
                    aria-current={activeGroup === section.id ? 'true' : undefined}
                    className={cn(
                      'flex items-center justify-between rounded-sm px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground',
                      activeGroup === section.id && 'bg-muted font-medium text-foreground',
                    )}
                  >
                    {section.label}
                    {errorGroups.has(section.id) ? (
                      <span
                        className="size-1.5 rounded-full bg-destructive"
                        role="img"
                        aria-label="has errors"
                      />
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(event) => event.preventDefault()}
            noValidate
          >
            {orphanErrors.length === 0 ? null : (
              <div
                id="form-errors"
                tabIndex={-1}
                role="alert"
                className="rounded-md border border-destructive/60 bg-card px-4 py-2.5 text-[13px]"
              >
                <p className="font-medium text-destructive">These options conflict</p>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {orphanErrors.map((item, index) => (
                    <li key={index}>{item.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {sections.map((section) => {
              const basic = section.visible.filter((def) => def.advanced !== true)
              const advanced = section.visible.filter((def) => def.advanced === true)
              const hasAdvancedError = advanced.some((def) => grouped.has(def.key))
              const open = (advancedOpen[section.id] ?? basic.length === 0) || hasAdvancedError

              return (
                <section
                  key={section.id}
                  id={`section-${section.id}`}
                  aria-labelledby={`heading-${section.id}`}
                  className="rounded-md border border-border bg-card"
                >
                  <header className="flex items-baseline gap-2 border-b border-border px-4 py-2.5">
                    <h2 id={`heading-${section.id}`} className="text-sm font-semibold">
                      {section.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">{section.description}</span>
                  </header>
                  <div className="px-4 py-1">
                    {[...basic, ...(open ? advanced : [])].map((def) => (
                      <OptionRow
                        key={def.key}
                        def={def}
                        options={options}
                        errors={grouped.get(def.key)}
                        onChange={setValue}
                      />
                    ))}
                  </div>
                  {advanced.length === 0 ? null : (
                    <div className="border-t border-border px-4 py-1.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setAdvancedOpen((current) => ({ ...current, [section.id]: !open }))
                        }
                      >
                        {open ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        {open ? 'Hide advanced' : 'Show advanced'} ({advanced.length})
                      </button>
                    </div>
                  )}
                </section>
              )
            })}
          </form>

          <aside aria-label="Preview" className="hidden lg:block">
            {preview(
              'sticky top-[132px] h-[calc(100vh-148px)] xl:top-[108px] xl:h-[calc(100vh-124px)]',
            )}
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background p-2 lg:hidden">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-center shadow-none"
            onClick={() => setSheetOpen(true)}
          >
            <Eye /> Preview nginx.conf · {lineCount} lines
            {errorCount > 0 ? <span className="size-1.5 rounded-full bg-destructive" /> : null}
          </Button>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="h-[88vh] gap-0 p-0 [&>button]:top-2.5">
            <SheetHeader className="p-3 pb-2">
              <SheetTitle className="text-sm">Preview</SheetTitle>
              <SheetDescription className="sr-only">
                Generated nginx.conf for your options.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 px-2 pb-2">{preview('h-full')}</div>
          </SheetContent>
        </Sheet>
        <Toaster theme={dark ? 'dark' : 'light'} position="bottom-right" />
      </div>
    </TooltipProvider>
  )
}
