import type { FormEvent } from 'react'
import type { CRM, Lead, Mail } from '../../domain/crm'
import { navigate, type Change } from '../../app/model'
import { Button, Modal } from '../../ui/components'

export function LeadForm({ data, change, mail, lead, onClose }: { data: CRM; change: Change; mail?: Mail; lead?: Lead; onClose: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    if (!read('title') || !read('company')) return
    if (mail && data.mails.find(item => item.id === mail.id)?.leadId) return
    const details = { company: read('company'), title: read('title'), contact: read('contact'), email: read('email'), summary: read('summary') }
    const stage = lead?.stage ?? data.stages[0]?.id
    if (!stage) return
    const item: Lead = { ...details, id: lead?.id ?? crypto.randomUUID(), stage, ownerId: data.activeMemberId }
    const result = await change(prev => ({
      ...prev,
      leads: lead ? prev.leads.map(row => row.id === lead.id ? { ...row, ...details } : row) : [item, ...prev.leads],
      mails: mail ? prev.mails.map(row => row.id === mail.id ? { ...row, leadId: item.id, excluded: false } : row) : prev.mails,
    }), lead ? '리드 정보를 수정했어요.' : '새 리드를 등록했어요.')
    if (!result) return
    onClose()
    if (!lead) navigate(`/leads/${result.id ?? item.id}`)
  }
  return <Modal title={lead ? '리드 수정' : '새 리드 등록'} onClose={onClose}><form className="form" onSubmit={submit}>
    <label>리드명<input name="title" required autoFocus defaultValue={lead?.title ?? mail?.subject} maxLength={120}/></label>
    <div className="form-grid"><label>고객사<input name="company" required defaultValue={lead?.company ?? mail?.company}/></label><label>담당자 이름<input name="contact" defaultValue={lead?.contact ?? mail?.sender}/></label></div>
    <label>담당자 이메일<input name="email" type="email" defaultValue={lead?.email ?? mail?.email}/></label>
    <label>문의 요약<textarea name="summary" rows={4} defaultValue={lead?.summary ?? mail?.body}/></label>
    {!lead && !data.stages.length && <p className="error-text">팀의 영업 단계를 먼저 등록해 주세요.</p>}
    <div className="form-actions"><Button onClick={onClose}>취소</Button><Button type="submit" tone="primary" disabled={!lead && !data.stages.length}>{lead ? '저장' : '리드 등록'}</Button></div>
  </form></Modal>
}
