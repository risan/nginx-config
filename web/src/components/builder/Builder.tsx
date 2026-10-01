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
import { decodeShareHash, encodeShareHash, groupLabel, visibleOptions } from '@/lib/state'
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
      dispatch({ type: 'restore', options: restored })
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

  const errorFields = Object.keys(errors).map((key) => ({
    key,
    label: OPTIONS.find((def) => def.key === key)?.label ?? key,
  }))

  function setValue(key: string, value: Options[string]) {
    // A section that an error opened must stay open after the edit clears that error,
    // so fields do not vanish under the cursor.
    const opened = sections
      .filter((section) =>
        section.visible.some((def) => def.advanced === true && errors[def.key] !== undefined),
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
    (key: string) => {
      const def = OPTIONS.find((candidate) => candidate.key === key)
      if (def === undefined) {
        return
      }

      setSheetOpen(false)
      setAdvancedOpen((current) => ({ ...current, [def.group]: true }))
      window.setTimeout(() => {
        const row = document.getElementById(`row-${key}`)
        row?.scrollIntoView({ block: 'center' })
        row
          ?.querySelector<HTMLElement>(
            '[data-control] :is(input, button, [role="radio"], [role="switch"])',
          )
          ?.focus()
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
    const hash = encodeShareHash(options)
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
            {sections.map((section) => {
              const basic = section.visible.filter((def) => def.advanced !== true)
              const advanced = section.visible.filter((def) => def.advanced === true)
              const hasAdvancedError = advanced.some((def) => errors[def.key] !== undefined)
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
                        error={errors[def.key]}
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
