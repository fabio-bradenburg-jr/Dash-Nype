'use client'

import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  
  const supabase = createClient()
  const nextPath = searchParams.get('next') || '/home'

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)

      if (isSignUp) {
        const registerResponse = await fetch('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName,
            email,
            password,
          }),
        })

        const registerData = await registerResponse.json()

        if (!registerResponse.ok) {
          throw new Error(registerData.error || 'Não foi possível criar a conta.')
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) throw error

      window.location.href = nextPath
    } catch (error) {
      alert('Erro na Autenticação: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container glass-panel">
      <div className="login-box">
        <div className="logo login-logo">
          <i className='bx bxl-meta'></i>
          <span>Dash</span>
        </div>
        
        <h2>{isSignUp ? 'Crie sua Conta' : 'Bem-vindo de volta'}</h2>
        <p className="login-subtitle">
          {isSignUp 
            ? 'Cadastre-se para conectar suas APIs e ver dados em tempo real.' 
            : 'Faça login para acessar seu painel operacional e executivo.'}
        </p>

        <form onSubmit={handleEmailAuth} className="email-form">
          {isSignUp && (
            <div className="input-group">
              <i className='bx bx-user'></i>
              <input
                type="text"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div className="input-group">
            <i className='bx bx-envelope'></i>
            <input 
              type="email" 
              placeholder="Seu melhor e-mail" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <i className='bx bx-lock-alt'></i>
            <input 
              type="password" 
              placeholder="Sua senha secreta" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary email-btn"
          >
            {loading 
              ? 'Aguarde...' 
              : isSignUp ? 'Criar Conta' : 'Entrar no Painel'
            }
          </button>
        </form>

        <p className="login-footer">
          {isSignUp ? 'Já tem uma conta? ' : 'Ainda não é membro? '}
          <span 
            className="toggle-auth" 
            onClick={() => {
              setIsSignUp(!isSignUp)
              setFullName('')
            }}
          >
            {isSignUp ? 'Faça login' : 'Crie sua conta aqui'}
          </span>
        </p>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .login-box {
          background: var(--bg-panel);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          backdrop-filter: blur(20px);
        }
        .login-logo {
          justify-content: center;
          margin-bottom: 24px;
          font-size: 28px;
        }
        h2 {
          font-size: 24px;
          margin-bottom: 12px;
          color: var(--text-primary);
        }
        .login-subtitle {
          color: var(--text-secondary);
          font-size: 15px;
          margin-bottom: 32px;
          line-height: 1.5;
        }
        .email-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .input-group {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-group i {
          position: absolute;
          left: 16px;
          font-size: 20px;
          color: var(--text-muted);
        }
        .input-group input {
          width: 100%;
          padding: 14px 14px 14px 44px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          font-family: inherit;
          font-size: 15px;
          transition: border-color 0.2s;
        }
        .input-group input:focus {
          outline: none;
          border-color: var(--accent-blue);
        }
        .email-btn {
          width: 100%;
          padding: 14px;
          font-size: 16px;
          justify-content: center;
          border-radius: 12px;
          font-weight: 600;
        }
        .login-footer {
          margin-top: 32px;
          font-size: 14px;
          color: var(--text-muted);
        }
        .toggle-auth {
          color: var(--accent-blue);
          cursor: pointer;
          font-weight: 600;
        }
        .toggle-auth:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
