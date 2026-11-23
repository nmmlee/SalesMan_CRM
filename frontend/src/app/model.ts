import { useEffect, useRef, useState } from 'react'
import { incomingMail } from '../data/demo'
import { loadDemo, saveDemo } from '../data/storage'
import { type CRM } from '../domain/crm'

export type Change = (update: (current: CRM) => CRM, message?: string) => Promise<{ id?: string } | null>
type MutationResult = { id?: string; entity?: 'lead' | 'task' | 'mail' | 'template' | 'draft' | 'profile' | 'mailbox' | 'registerLead'; recordId?: string; version?: number; temporaryId?: string; emailId?: string; mailVersion?: number }

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function useFeedback() {
  const [message, setMessage] = useState('')
  const toast = useRef<number | undefined>(undefined)
  function notify(text: string) {
    window.clearTimeout(toast.current)
    setMessage(text)
    toast.current = window.setTimeout(() => setMessage(''), 3600)
  }
  useEffect(() => () => window.clearTimeout(toast.current), [])
  return { message, notify }
}

export function useDemoCRM() {
  const [data, setData] = useState(loadDemo)
  const { message, notify } = useFeedback()
  const current = useRef(data)
  const sync = useRef<number | undefined>(undefined)

  const change: Change = async (update, feedback) => {
    const next = update(current.current)
    current.current = next
    setData(next)
    if (!saveDemo(next)) notify('브라우저 저장에 실패했어요. 변경 사항은 현재 화면에서만 유지됩니다.')
    else if (feedback) notify(feedback)
    return {}
  }

  function syncMailbox() {
    if (current.current.mailbox.status === 'working') return
    change(prev => ({ ...prev, mailbox: { ...prev.mailbox, status: 'working' } }))
    sync.current = window.setTimeout(() => {
      const incoming = incomingMail()
      const hasMail = current.current.mails.some(mail => mail.id === incoming.id)
      change(prev => ({
        ...prev,
        mails: hasMail ? prev.mails : [incoming, ...prev.mails],
        mailbox: { status: 'ready', lastSuccess: incoming.receivedAt },
      }), hasMail ? '동기화를 마쳤어요. 새 메일은 없어요.' : '새 문의 메일 한 건을 가져왔어요.')
    }, 750)
  }

  useEffect(() => () => {
    window.clearTimeout(sync.current)
  }, [])

  function demoAutoSync() {
    if (current.current.mailbox.status === 'ready' && !current.current.mails.some(mail => mail.id === 'demo-incoming')) {
      syncMailbox()
    }
  }

  return { data, change, message, syncMailbox, demoAutoSync }
}

async function api<T>(action: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api?action=${action}`, { ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new ApiError(response.status, result.error || '서버 요청에 실패했어요.')
  return result
}

function applyMutation(data: CRM, result: MutationResult): CRM {
  if (result.entity === 'registerLead' && result.temporaryId && result.recordId) {
    return { ...data,
      leads: data.leads.map(lead => lead.id === result.temporaryId
        ? { ...lead, id: result.recordId!, version: result.version } : lead),
      mails: data.mails.map(mail => mail.id === result.emailId
        ? { ...mail, leadId: result.recordId, version: result.mailVersion } : mail) }
  }
  if (result.entity === 'profile') return { ...data, profileVersion: result.version }
  if (result.entity === 'mailbox') return { ...data, mailbox: { ...data.mailbox, version: result.version } }
  if (!result.entity || !result.recordId || result.version == null) return data
  if (result.entity === 'lead') return { ...data, leads: data.leads.map(item => item.id === result.recordId ? { ...item, version: result.version } : item) }
  if (result.entity === 'task') return { ...data, tasks: data.tasks.map(item => item.id === result.recordId ? { ...item, version: result.version } : item) }
  if (result.entity === 'mail') return { ...data, mails: data.mails.map(item => item.id === result.recordId ? { ...item, version: result.version } : item) }
  if (result.entity === 'template') return { ...data, templates: data.templates.map(item => item.id === result.recordId ? { ...item, version: result.version } : item) }
  if (result.entity === 'draft') return { ...data, drafts: data.drafts.map(item => item.id === result.recordId ? { ...item, version: result.version } : item) }
  return data
}

export function useRemoteCRM(userId: string) {
  const [data, setData] = useState<CRM | null>(null)
  const [error, setError] = useState('')
  const { message, notify } = useFeedback()
  const current = useRef<CRM | null>(null)
  const busy = useRef(false)
  const mounted = useRef(false)

  async function reload() {
    const fresh = (await api<{ data: CRM }>('snapshot')).data
    if (!mounted.current) return
    current.current = fresh
    setData(fresh)
    setError('')
  }

  async function refresh() {
    if (busy.current) return
    busy.current = true
    try {
      await reload()
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '팀 데이터를 불러오지 못했어요.')
    } finally {
      busy.current = false
    }
  }

  useEffect(() => {
    mounted.current = true
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', refresh)
    }
  }, [userId])

  const change: Change = async (update, feedback) => {
    if (!current.current) return null
    if (busy.current) {
      notify('이전 요청을 처리 중이에요. 잠시 후 다시 시도해 주세요.')
      return null
    }
    busy.current = true
    try {
      const before = current.current
      const next = update(before)
      const result = await api<MutationResult>('change', { method: 'POST', body: JSON.stringify({ before, after: next }) })
      const saved = applyMutation(next, result)
      current.current = saved
      if (mounted.current) {
        setData(saved)
        setError('')
        if (feedback) notify(feedback)
      }
      return result
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          await reload()
          if (mounted.current) notify('다른 사용자가 먼저 수정했어요. 최신 내용을 불러왔습니다. 다시 확인해 주세요.')
        } catch {
          if (mounted.current) setError('동시 수정이 감지됐지만 최신 데이터를 불러오지 못했어요. 다시 불러와 주세요.')
        }
      } else if (mounted.current) notify(cause instanceof Error ? `저장 실패 · ${cause.message}` : '저장에 실패했어요.')
      return null
    } finally {
      busy.current = false
    }
  }
  return { data, change, message, error, refresh }
}

export function useRoute() {
  const read = () => window.location.hash.slice(1) || '/'
  const [path, setPath] = useState(read)
  useEffect(() => {
    const listener = () => setPath(read())
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  const [pathname, query = ''] = path.split('?')
  const [, page = '', id] = pathname.split('/')
  return { page, id, params: new URLSearchParams(query) }
}
export function navigate(to: string) {
  window.location.hash = to
}
