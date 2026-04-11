'use client'

import { useState } from 'react'
import { LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@nype.demo')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const nextPath =
        typeof window === 'undefined'
          ? '/'
          : new URLSearchParams(window.location.search).get('next') || '/'

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Nao foi possivel autenticar.')
      }

      window.location.href = nextPath
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_22%),linear-gradient(180deg,#eff6ff,#ffffff)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0.6))] p-8 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-[var(--saas-accent)]" />
            Nype Orbit
          </div>
          <h1 className="mt-6 font-manrope text-5xl font-extrabold tracking-[-0.05em] text-slate-950">
            Marketing intelligence with client ops built in.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Enter with your agency account to access unified ad metrics, CRM sync, health scoring, client management, and operator workflows in one interface.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Multi-tenant access',
                copy: 'Each user only sees the tenant and portfolio they are allowed to operate.',
                icon: ShieldCheck,
              },
              {
                title: 'Marketing data layer',
                copy: 'Meta Ads, Google Ads, LinkedIn Ads, and Agendor metrics normalized in one model.',
                icon: Sparkles,
              },
              {
                title: 'Operations visibility',
                copy: 'Checklist, tasks, churn watch, and account health all stay connected to delivery.',
                icon: LockKeyhole,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="rounded-[28px] border border-slate-200/70 bg-white/80 p-5 shadow-sm">
                  <div className="mb-4 inline-flex rounded-2xl bg-slate-950 p-3 text-white">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="font-manrope text-lg font-extrabold text-slate-950">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-[36px] border border-slate-200/80 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:p-10">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">Secure sign in</p>
            <h2 className="mt-3 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">Access your workspace</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Use the FastAPI JWT flow. Demo credentials are prefilled so we can validate the experience end to end.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Email
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <Mail className="h-4 w-4 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@nype.demo"
                  required
                />
              </div>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Password
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <LockKeyhole className="h-4 w-4 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="admin123"
                  required
                />
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            <Button className="h-12 w-full text-base" disabled={loading} type="submit">
              {loading ? 'Signing in...' : 'Enter platform'}
            </Button>
          </form>

          <div className="mt-6 rounded-[28px] border border-slate-200/80 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Demo access</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <p><strong>Admin:</strong> admin@nype.demo / admin123</p>
              <p><strong>Operator:</strong> operator@nype.demo / operator123</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
