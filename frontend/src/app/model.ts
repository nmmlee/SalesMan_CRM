import { useEffect, useRef, useState } from 'react'
import { incomingMail } from '../data/demo'
import { loadDemo, saveDemo } from '../data/storage'
import { type CRM } from '../domain/crm'

export type Change = (update: (current: CRM) => CRM, message?: string) => void

export function useCRM() {
  const [data, setData] = useState(loadDemo)
  const [message, setMessage] = useState('')
  const current = useRef(data)
  const toast = useRef<number | undefined>(undefined)
  const sync = useRef<number | undefined>(undefined)

  function notify(text: string) {
    window.clearTimeout(toast.current)
    setMessage(text)
    toast.current = window.setTimeout(() => setMessage(''), 3600)
  }

  const change: Change = (update, feedback) => {
    const next = update(current.current)
    current.current = next
    setData(next)
    if (!saveDemo(next)) notify('브라우저 저장에 실패했어요. 변경 사항은 현재 화면에서만 유지됩니다.')
    else if (feedback) notify(feedback)
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
    window.clearTimeout(toast.current)
    window.clearTimeout(sync.current)
  }, [])

  function demoAutoSync() {
    if (current.current.mailbox.status === 'ready' && !current.current.mails.some(mail => mail.id === 'demo-incoming')) {
      syncMailbox()
    }
  }

  return { data, change, message, syncMailbox, demoAutoSync }
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
