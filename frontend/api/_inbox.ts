import { timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { InvalidDirectoryChange } from './_directory.js'

export function canIngest(header: string | string[] | undefined, token: string) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const supplied = Buffer.from(header.slice(7))
  const expected = Buffer.from(token)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export async function receiveInquiry(client: SupabaseClient, values: Record<string, unknown>) {
  function field(name: string, max: number, required = false) {
    const value = values[name]
    if (value == null && !required) return null
    if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\0')) {
      throw new InvalidDirectoryChange(`메일 수신 필드를 확인해 주세요. (${name})`)
    }
    return value
  }
  function address(name: string) {
    const value = field(name, 254, true)!.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new InvalidDirectoryChange(`이메일 주소를 확인해 주세요. (${name})`)
    return value
  }
  const receivedAt = field('receivedAt', 40, true)!
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(receivedAt) || !Number.isFinite(Date.parse(receivedAt))) {
    throw new InvalidDirectoryChange('receivedAt에는 시간대가 포함된 ISO 8601 시각을 입력해 주세요.')
  }
  const { error } = await client.rpc('crm_receive_inquiry', {
    p_mailbox: address('mailbox'),
    p_message_id: field('messageId', 512, true)!.trim(),
    p_thread_id: field('threadId', 512),
    p_sender_name: field('senderName', 200),
    p_sender_email: address('senderEmail'),
    p_company_name: field('companyName', 200),
    p_subject: field('subject', 1000)?.trim() || '(제목 없음)',
    p_body: field('body', 250_000),
    p_received_at: receivedAt,
  })
  if (error) throw new Error(error.message)
}
