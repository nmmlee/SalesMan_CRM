import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CRM } from '../src/domain/crm.js'
import { loadCRM, persistCRM } from './_server.js'

type SessionUser = { id: string; username: string; display_name: string; role: string }
type ApiRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
  body?: unknown
}
type ApiResponse = {
  setHeader(name: string, value: string): void
  status(code: number): ApiResponse
  json(value: unknown): void
}
const COOKIE = 'salesman_session'
const SESSION_SECONDS = 60 * 60 * 24 * 30

function database() {
  const url = process.env.SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) throw new Error('server_configuration_missing')
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}

function cookieValue(req: ApiRequest) {
  const cookies = String(req.headers.cookie ?? '').split(';')
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split('=')
    if (name === COOKIE) return decodeURIComponent(parts.join('='))
  }
  return ''
}

function setSessionCookie(req: ApiRequest, res: ApiResponse, token: string) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`)
}

function clearSessionCookie(req: ApiRequest, res: ApiResponse) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

function body(req: ApiRequest) {
  if (typeof req.body === 'string') return JSON.parse(req.body) as Record<string, unknown>
  return (req.body ?? {}) as Record<string, unknown>
}

function postFromSameSite(req: ApiRequest) {
  const originHeader = req.headers.origin
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
  if (!origin) return true
  const hostHeader = req.headers.host
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  try { return new URL(origin).host === host } catch { return false }
}

async function sessionUser(client: SupabaseClient, token: string) {
  if (!token) return null
  const { data, error } = await client.rpc('crm_session_user', { p_token: token })
  if (error) throw new Error(error.message)
  return (data?.[0] as SessionUser | undefined) ?? null
}

function publicUser(user: SessionUser) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
}

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('username_taken')) return { status: 409, message: '이미 사용 중인 사용자명이에요.' }
  if (message.includes('invalid_credentials')) return { status: 401, message: '사용자명 또는 비밀번호를 확인해 주세요.' }
  if (message.includes('weak_password')) return { status: 400, message: '비밀번호는 8자 이상 입력해 주세요.' }
  if (message.includes('invalid_username')) return { status: 400, message: '사용자명 형식을 확인해 주세요.' }
  if (message.includes('invalid_display_name')) return { status: 400, message: '이름을 확인해 주세요.' }
  return { status: 500, message: '요청을 처리하지 못했어요.' }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action
  if (req.method === 'POST' && !postFromSameSite(req)) return res.status(403).json({ error: '허용되지 않은 요청이에요.' })

  try {
    const client = database()
    if (action === 'signup' && req.method === 'POST') {
      const values = body(req)
      const { data, error } = await client.rpc('crm_sign_up', {
        p_username: String(values.username ?? ''), p_password: String(values.password ?? ''),
        p_display_name: String(values.displayName ?? ''),
      })
      if (error) throw new Error(error.message)
      setSessionCookie(req, res, String(data?.[0]?.session_token ?? ''))
      return res.status(201).json({ ok: true })
    }
    if (action === 'login' && req.method === 'POST') {
      const values = body(req)
      const { data, error } = await client.rpc('crm_login', {
        p_username: String(values.username ?? ''), p_password: String(values.password ?? ''),
      })
      if (error) throw new Error(error.message)
      setSessionCookie(req, res, String(data?.[0]?.session_token ?? ''))
      return res.status(200).json({ ok: true })
    }

    const token = cookieValue(req)
    if (action === 'logout' && req.method === 'POST') {
      if (token) await client.rpc('crm_logout', { p_token: token })
      clearSessionCookie(req, res)
      return res.status(200).json({ ok: true })
    }
    const user = await sessionUser(client, token)
    if (!user) {
      clearSessionCookie(req, res)
      return res.status(401).json({ error: '로그인이 필요해요.' })
    }
    if (action === 'me' && req.method === 'GET') return res.status(200).json({ user: publicUser(user) })
    if (action === 'password' && req.method === 'POST') {
      const values = body(req)
      const { error } = await client.rpc('crm_change_password', { p_token: token,
        p_current_password: String(values.currentPassword ?? ''), p_new_password: String(values.newPassword ?? '') })
      if (error) throw new Error(error.message)
      return res.status(200).json({ ok: true })
    }
    if (action === 'snapshot' && req.method === 'GET') {
      return res.status(200).json({ data: await loadCRM(client, user.id) })
    }
    if (action === 'change' && req.method === 'POST') {
      const values = body(req)
      const result = await persistCRM(client, user.id, values.after as CRM)
      return res.status(200).json(result)
    }
    return res.status(404).json({ error: 'API 요청을 찾을 수 없어요.' })
  } catch (error) {
    const response = authError(error)
    return res.status(response.status).json({ error: response.message })
  }
}
