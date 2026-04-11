'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeSettings } from '@/lib/saas/types'

export function ThemePanel({ initialTheme }: { initialTheme: ThemeSettings }) {
  const [theme, setTheme] = useState(initialTheme)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  function updateTheme(nextTheme: ThemeSettings) {
    setTheme(nextTheme)
    const root = document.documentElement
    root.style.setProperty('--saas-primary', nextTheme.primaryColor)
    root.style.setProperty('--saas-accent', nextTheme.accentColor)
    root.style.setProperty('--saas-surface', nextTheme.backgroundColor)
    root.dataset.uiMode = nextTheme.darkMode ? 'dark' : 'light'
  }

  async function persistTheme() {
    setSaving(true)
    try {
      await fetch('/api/saas/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Estúdio de tema</CardTitle>
          <CardDescription>Personalize as cores da plataforma e o modo escuro por tenant.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {[
          { label: 'Primária', value: theme.primaryColor, key: 'primaryColor' },
          { label: 'Destaque', value: theme.accentColor, key: 'accentColor' },
          { label: 'Fundo', value: theme.backgroundColor, key: 'backgroundColor' },
        ].map((item) => (
          <label key={item.key} className="grid gap-2 text-sm font-medium text-slate-600">
            <span className="font-semibold text-slate-700">{item.label}</span>
            <input
              type="color"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
              value={item.value}
              onChange={(event) => updateTheme({ ...theme, [item.key]: event.target.value })}
            />
          </label>
        ))}
        <div className="flex items-end">
          <Button variant="secondary" className="w-full" onClick={() => updateTheme({ ...theme, darkMode: !theme.darkMode })}>
            {theme.darkMode ? 'Desativar modo escuro' : 'Ativar modo escuro'}
          </Button>
        </div>
        <div className="md:col-span-2">
          <Button className="w-full" onClick={persistTheme} disabled={saving}>
            {saving ? 'Salvando tema...' : 'Salvar tema'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
