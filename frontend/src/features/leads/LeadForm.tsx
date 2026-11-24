import type { FormEvent } from 'react'
import type { Contact, CRM, Lead } from '../../domain/crm'
import { navigate, type Change } from '../../app/model'
import { FormActions, Modal } from '../../ui/components'

export function LeadForm({ data, change, contact, lead, onClose }: { data: CRM; change: Change; contact?: Contact; lead?: Lead; onClose: () => void }) {
  const company = data.companies.find(row => row.id === contact?.companyId)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    if (!read('title') || (!lead && (!company || !contact))) return
    const details = { title: read('title'), summary: read('summary') }
    const stage = lead?.stage ?? data.stages[0]?.id
    if (!stage) return
    const item: Lead = lead ? { ...lead, ...details } : {
      ...details, id: crypto.randomUUID(), createdAt: new Date().toISOString(), stage, ownerId: data.activeMemberId, companyId: company?.id,
      contactId: contact?.id, company: company?.name ?? '', contact: contact?.name ?? '', email: contact?.email ?? '',
    }
    const result = await change(prev => ({
      ...prev,
      leads: lead ? prev.leads.map(row => row.id === lead.id ? { ...row, ...details } : row) : [item, ...prev.leads],
    }), lead ? '리드 정보를 수정했어요.' : '새 리드를 등록했어요.')
    if (!result) return
    onClose()
    if (!lead) navigate(`/leads/${result.id ?? item.id}`)
  }
  return <Modal title={lead ? '리드 수정' : '새 리드 등록'} onClose={onClose}><form className="form" onSubmit={submit}>
    <p className="muted">{lead?.company ?? company?.name} · {(lead?.contact ?? contact?.name) || '담당자 미지정'}</p>
    <label>리드명<input name="title" required autoFocus defaultValue={lead?.title} maxLength={120}/></label>
    <label>문의 요약<textarea name="summary" rows={4} defaultValue={lead?.summary}/></label>
    {!lead && !data.stages.length && <p className="error-text">팀의 영업 단계를 먼저 등록해 주세요.</p>}
    <FormActions onCancel={onClose} label={lead ? '저장' : '리드 등록'} disabled={!lead && !data.stages.length}/>
  </form></Modal>
}
