import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../ui/components'

export type SessionUser = { id: string; username: string; displayName: string; role: string }
export const serverMode = import.meta.env.VITE_CRM_MODE === 'server'
const USERNAME = /^[a-z0-9][a-z0-9_-]{3,31}$/

export function AuthPanel({ title, children }: { title: string; children?: ReactNode }) {
  return <main className="auth-shell"><section className="panel auth-panel">
    <p className="auth-brand">bpocrm</p><h1>{title}</h1>{children}
  </section></main>
}

async function request<T>(action: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api?action=${action}`, { ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했어요.')
  return result
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null | undefined>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    request<{ user: SessionUser }>('me').then(result => {
      if (!cancelled) setUser(result.user)
    }).catch(() => {
      if (!cancelled) setUser(null)
    })
    return () => { cancelled = true }
  }, [attempt])
  return { user, reload: () => setAttempt(value => value + 1) }
}

export function Login({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [registering, setRegistering] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const values = new FormData(form)
    const username = String(values.get('username') ?? '').trim().toLowerCase()
    const password = String(values.get('password') ?? '')
    if (!USERNAME.test(username)) {
      setError('사용자명은 영문 소문자·숫자·하이픈·밑줄 4~32자로 입력해 주세요.')
      return
    }
    if (registering && password !== values.get('confirmPassword')) {
      setError('비밀번호가 서로 일치하지 않아요.')
      return
    }
    setPending(true)
    setError('')
    try {
      await request(registering ? 'signup' : 'login', { method: 'POST', body: JSON.stringify({
        username, password, displayName: String(values.get('displayName') ?? '').trim(),
      }) })
      form.reset()
      onAuthenticated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인하지 못했어요.')
    } finally {
      setPending(false)
    }
  }
  return <AuthPanel title={registering ? '회원가입' : '로그인'}>
    <form className="form" onSubmit={submit}>
      {registering && <label>이름<input name="displayName" required maxLength={40} autoComplete="name"/></label>}
      <label>사용자명<input name="username" required minLength={4} maxLength={32} autoComplete="username" autoCapitalize="none"/></label>
      <label>비밀번호<input name="password" type="password" required minLength={8}
        autoComplete={registering ? 'new-password' : 'current-password'}/></label>
      {registering && <label>비밀번호 확인<input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password"/></label>}
      {error && <p role="alert" className="error-text">{error}</p>}
      <Button type="submit" tone="primary" disabled={pending}>{pending ? '처리 중' : registering ? '가입하기' : '로그인'}</Button>
      <Button tone="quiet" onClick={() => { setRegistering(value => !value); setError('') }}>
        {registering ? '이미 계정이 있어요' : '처음 사용하시나요? 회원가입'}
      </Button>
    </form>
  </AuthPanel>
}

export function PasswordForm() {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const values = new FormData(form)
    const newPassword = String(values.get('newPassword') ?? '')
    if (newPassword !== values.get('confirmPassword')) {
      setFailed(true); setNotice('새 비밀번호가 서로 일치하지 않아요.'); return
    }
    setPending(true); setNotice('')
    try {
      await request('password', { method: 'POST', body: JSON.stringify({
        currentPassword: values.get('currentPassword'), newPassword,
      }) })
      form.reset(); setFailed(false); setNotice('비밀번호를 변경했어요.')
    } catch (cause) {
      setFailed(true); setNotice(cause instanceof Error ? cause.message : '비밀번호를 변경하지 못했어요.')
    } finally { setPending(false) }
  }
  return <form className="form" onSubmit={submit}>
    <label>현재 비밀번호<input name="currentPassword" required type="password" autoComplete="current-password"/></label>
    <label>새 비밀번호<input name="newPassword" required minLength={8} type="password" autoComplete="new-password"/></label>
    <label>새 비밀번호 확인<input name="confirmPassword" required minLength={8} type="password" autoComplete="new-password"/></label>
    {notice && <p className={failed ? 'error-text' : 'muted'} role={failed ? 'alert' : 'status'}>{notice}</p>}
    <Button type="submit" tone="primary" disabled={pending}>{pending ? '변경 중' : '비밀번호 변경'}</Button>
  </form>
}

export async function signOut() {
  await request('logout', { method: 'POST' })
}
