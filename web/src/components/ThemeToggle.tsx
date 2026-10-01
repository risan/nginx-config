import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { setDarkTheme, useIsDark } from '@/lib/theme'

export default function ThemeToggle() {
  const dark = useIsDark()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setDarkTheme(!dark)}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
