import { useState, type FormEvent } from 'react'
import type { Change } from '../../app/model'
import { lossReasonLimit, lossStageFor, stageLabel, type CRM, type Lead } from '../../domain/crm'
import { FormActions, Modal, NoteField } from '../../ui/components'

export function LossForm({ data, lead, change, onClose }: { data: CRM; lead: Lead; change: Change; onClose: () => void }) {
  const [original] = useState(lead)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('text') ?? '').trim()
    if (!reason || reason.length > lossReasonLimit) {
      setError('로스트 사유를 1~2,000자로 입력해 주세요.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await change(previous => {
        const current = previous.leads.find(item => item.id === original.id)
        const stage = current && lossStageFor(previous, current)
        if (!current || !stage || current.stage !== original.stage || current.version !== original.version) {
          throw new Error('리드 상태가 변경됐어요. 창을 닫고 최신 상태를 확인해 주세요.')
        }
        return {
          ...previous,
          leads: previous.leads.map(item => item.id === current.id ? { ...item, stage: stage.id, lossReason: reason } : item),
          activities: [{
            id: crypto.randomUUID(), leadId: current.id, type: '단계 변경',
            text: `${stageLabel(previous, current.stage)} → ${stage.label}\n사유: ${reason}`,
            authorId: previous.activeMemberId, at: new Date().toISOString(),
          }, ...previous.activities],
        }
      }, '리드를 로스트 처리했어요.')
      if (result) onClose()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="리드 로스트 처리" onClose={onClose}>
    <form className="form record-form" onSubmit={submit}>
      <div className="loss-target"><strong>{lead.title}</strong><span>{lead.company} · {stageLabel(data, lead.stage)}</span></div>
      <NoteField label="로스트 사유" placeholder="예산, 일정, 제품 적합성 등 논의가 중단된 이유를 남겨 주세요." maxLength={lossReasonLimit}/>
      <FormActions onCancel={onClose} saving={saving} error={error} label="로스트 처리" tone="danger"/>
    </form>
  </Modal>
}
