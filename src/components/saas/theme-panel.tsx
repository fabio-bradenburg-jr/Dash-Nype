'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { applyThemeMode, applyThemeVariables, getThemeMode } from '@/lib/saas/theme-presets'
import { ThemeMode, ThemeSettings } from '@/lib/saas/types'

const SAAS_THEME_STORAGE_KEY = 'nype-orbit-saas-theme'

type ThemePanelProps = {
  initialTheme: ThemeSettings
  onThemeChange?: (theme: ThemeSettings) => void
  onThemeSaved?: (theme: ThemeSettings) => void
}

export function ThemePanel({ initialTheme, onThemeChange, onThemeSaved }: ThemePanelProps) {
  const [theme, setTheme] = useState(initialTheme)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setTheme(initialTheme)
  }, [initialTheme])

  function updateTheme(nextTheme: ThemeSettings) {
    setTheme(nextTheme)
    onThemeChange?.(nextTheme)
    applyThemeVariables(document.documentElement, nextTheme)
  }

  function selectMode(mode: ThemeMode) {
    updateTheme(applyThemeMode(theme, mode))
  }

  const activeMode = getThemeMode(theme)

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
      localStorage.setItem(SAAS_THEME_STORAGE_KEY, JSON.stringify(theme))
      onThemeSaved?.(theme)
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
        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:col-span-2">
          <div className="mb-3">
            <p className="font-semibold text-slate-900">Aparência do sistema</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">O modo escuro com verde LP é o padrão. Use o personalizado para liberar os ajustes de cor.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { key: 'dark', label: 'Modo escuro', description: 'Fundo profundo e detalhes no verde da marca.' },
              { key: 'light', label: 'Modo claro', description: 'Superfícies claras com o mesmo verde LP.' },
              { key: 'custom', label: 'Personalizado', description: 'Libera todos os controles de cor.' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => selectMode(option.key as ThemeMode)}
                className={`rounded-[22px] border p-3 text-left transition ${
                  activeMode === option.key
                    ? 'border-slate-900 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
                    : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <p className="font-semibold text-slate-900">{option.label}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
        <label className="grid gap-2 text-sm font-medium text-slate-600">
          <span className="font-semibold text-slate-700">Nome do app</span>
          <input
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none"
            value={theme.appName || ''}
            onChange={(event) => updateTheme({ ...theme, appName: event.target.value })}
            placeholder="Ex.: Assessoria LP"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-600">
          <span className="font-semibold text-slate-700">Subtítulo</span>
          <input
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none"
            value={theme.appSubtitle || ''}
            onChange={(event) => updateTheme({ ...theme, appSubtitle: event.target.value })}
            placeholder="Ex.: Performance Hub"
          />
        </label>
        {activeMode === 'custom' ? [
          { label: 'Fundo da página', value: theme.backgroundColor, key: 'backgroundColor' },
          { label: 'Fundo das caixas', value: theme.panelColor || '#121817', key: 'panelColor' },
          { label: 'Cor dos detalhes', value: theme.accentColor, key: 'accentColor' },
          { label: 'Cor das letras', value: theme.textColor || '#f1f1f1', key: 'textColor' },
        ].map((item) => (
          <label key={item.key} className="grid gap-2 text-sm font-medium text-slate-600">
            <span className="font-semibold text-slate-700">{item.label}</span>
            <input
              type="color"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
              value={item.value}
              onChange={(event) => updateTheme({
                ...theme,
                ...(item.key === 'accentColor' ? { primaryColor: event.target.value } : {}),
                [item.key]: event.target.value,
              })}
            />
          </label>
        )) : null}
        <div className="rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4 md:col-span-2">
          <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-center">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {theme.logoUrl ? (
                <img src={theme.logoUrl} alt="Logo do app" className="h-full w-full object-contain p-3" />
              ) : (
                <span className="brand-logo-mark brand-logo-preview" aria-hidden="true"></span>
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
