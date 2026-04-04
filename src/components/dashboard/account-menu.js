'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/contexts/UserContext'

export function AccountMenu() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { user, profile, loading } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Conta'
  const displayRole = profile?.role || 'authenticated'

  async function handleSignOut() {
    try {
      setIsSigningOut(true)
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } finally {
      setIsSigningOut(false)
      setIsOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setIsOpen((current) => !current)} aria-label="Account" style={iconButtonStyle}>
        <span className="material-symbols-outlined">account_circle</span>
      </button>

      {isOpen ? (
        <div style={menuStyle}>
          <div style={{ padding: '0.25rem 0 0.75rem', borderBottom: '1px solid rgba(199,196,216,0.24)' }}>
            <strong style={{ display: 'block', fontSize: '0.88rem' }}>{loading ? 'Carregando...' : displayName}</strong>
            <span style={{ color: '#767587', fontSize: '0.74rem', textTransform: 'capitalize' }}>{displayRole}</span>
          </div>

          <div style={{ display: 'grid', gap: '0.35rem', paddingTop: '0.75rem' }}>
            <button type="button" onClick={() => router.push('/settings')} style={menuButtonStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                settings
              </span>
              Settings
            </button>
            <button type="button" onClick={handleSignOut} disabled={isSigningOut} style={{ ...menuButtonStyle, color: '#93000a', background: '#ffdad6' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                logout
              </span>
              {isSigningOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const iconButtonStyle = {
  border: 0,
  borderRadius: '999px',
  background: 'transparent',
  color: 'inherit',
  display: 'grid',
  placeItems: 'center',
  width: '2.5rem',
  height: '2.5rem',
}

const menuStyle = {
  position: 'absolute',
  top: 'calc(100% + 0.75rem)',
  right: 0,
  width: 'min(18rem, calc(100vw - 2rem))',
  borderRadius: '1rem',
  background: '#fff',
  color: '#1a1b20',
  padding: '1rem',
  boxShadow: '0 24px 48px rgba(26,27,32,0.16)',
  border: '1px solid rgba(199,196,216,0.24)',
  zIndex: 30,
}

const menuButtonStyle = {
  border: 0,
  borderRadius: '0.8rem',
  background: '#f4f3f9',
  color: '#464555',
  padding: '0.8rem 0.9rem',
  fontSize: '0.8rem',
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}
