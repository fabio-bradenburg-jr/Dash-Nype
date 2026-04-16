'use client'

import { useEffect, useState } from 'react'
import { Building2, LockKeyhole, Mail, ShieldCheck, Sparkles, User2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlError = new URLSearchParams(window.location.search).get('error')
    if (urlError) {
      setError(urlError)
    }
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const nextPath =
        typeof window === 'undefined'
          ? '/'
          : new URLSearchParams(window.location.search).get('next') || '/'

      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { email, password }
            : {
                full_name: fullName,
                company_name: companyName,
                email,
                password,
              }
        ),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'Não foi possível autenticar.')
      }

      window.location.href = nextPath
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  function handleFacebookLogin() {
    const nextPath =
      typeof window === 'undefined'
        ? '/'
        : new URLSearchParams(window.location.search).get('next') || '/'
    window.location.href = `/api/auth/facebook/start?next=${encodeURIComponent(nextPath)}`
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
            Inteligência de marketing com operação de clientes no mesmo sistema.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Entre com a sua conta ou crie um novo ambiente para acessar métricas unificadas, sync com CRM, gestão de clientes e operação em uma interface só.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Acesso multi-tenant',
                copy: 'Cada usuário enxerga apenas o tenant e a carteira que pode operar.',
                icon: ShieldCheck,
              },
              {
                title: 'Camada de dados',
                copy: 'Meta Ads, Google Ads, LinkedIn Ads e Agendor normalizados no mesmo modelo.',
                icon: Sparkles,
              },
              {
                title: 'Visibilidade operacional',
                copy: 'Checklist, tarefas, integrações e entrega conectados à operação.',
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
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
              {mode === 'login' ? 'Entrar com segurança' : 'Criar nova conta'}
            </p>
            <h2 className="mt-3 font-manrope text-3xl font-extrabold tracking-tight text-slate-950">
              {mode === 'login' ? 'Acesse seu ambiente' : 'Crie seu ambiente'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {mode === 'login'
                ? 'Use seu e-mail e sua senha para entrar no sistema.'
                : 'Cadastre sua conta de administrador e criamos um novo workspace para sua operação.'}
            </p>
            <div className="mt-5 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
                onClick={() => setMode('login')}
                type="button"
              >
                Entrar
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
                onClick={() => setMode('register')}
                type="button"
              >
                Criar conta
              </button>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <>
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Nome completo
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                    <User2 className="h-4 w-4 text-slate-400" />
                    <input
                      className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Seu nome"
                      required
                    />
                  </div>
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Empresa ou agência
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <input
                      className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                      type="text"
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="Nome da empresa"
                      required
                    />
                  </div>
                </label>
              </>
            ) : null}

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              E-mail
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <Mail className="h-4 w-4 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </div>
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Senha
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <LockKeyhole className="h-4 w-4 text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
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
              {loading
                ? mode === 'login'
                  ? 'Entrando...'
                  : 'Criando conta...'
                : mode === 'login'
                  ? 'Entrar na plataforma'
                  : 'Criar conta e entrar'}
            </Button>

            <button
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              onClick={handleFacebookLogin}
              type="button"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1877f2] font-manrope text-sm font-extrabold text-white">
                f
              </span>
              Entrar com Facebook
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
