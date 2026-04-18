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
    root.style.setProperty('--accent-blue', nextTheme.primaryColor)
    root.style.setProperty('--accent-orange', nextTheme.accentColor)
    root.style.setProperty('--main', nextTheme.primaryColor)
    root.style.setProperty('--accent', nextTheme.accentColor)
    root.dataset.uiMode = nextTheme.darkMode ? 'dark' : 'light'
  }

  function handleLogoUpload(file: File | undefined) {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      updateTheme({ ...theme, logoUrl: reader.result?.toString() || '' })
    }
    reader.readAsDataURL(file)
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
        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:col-span-2">
          <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-center">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {theme.logoUrl ? (
                <img src={theme.logoUrl} alt="Logo do app" className="h-full w-full object-contain p-3" />
              ) : (
                <span className="px-3 text-center text-xs font-semibold text-slate-400">Sem logo</span>
              )}
            </div>
            <div className="grid gap-3">
              <div>
                <p className="font-semibold text-slate-900">Logo geral do app</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">Aparece na navegação principal e no dashboard.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="file"
                  accept="image/*"
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm"
                  onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                />
                <input
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none"
                  value={theme.logoUrl || ''}
                  onChange={(event) => updateTheme({ ...theme, logoUrl: event.target.value })}
                  placeholder="Ou cole a URL da logo"
                />
              </div>
            </div>
          </div>
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
