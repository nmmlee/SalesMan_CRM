import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import type { Change } from '../../app/model'
import type { CustomerProfile, Lead } from '../../domain/crm'
import { Button, Modal, SectionTitle } from '../../ui/components'

const userCountFormat = new Intl.NumberFormat('ko-KR')

export function CustomerInfo({ lead, change }: { lead: Lead; change: Change }) {
  const [editing, setEditing] = useState(false)
  const profile = lead.customerProfile

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const read = (name: string) => String(values.get(name) ?? '').trim()
    const company = read('company')
    const users = form.elements.namedItem('expectedUsers') as HTMLInputElement
    const expectedUsers = users.value === '' ? undefined : users.valueAsNumber

    if (!company) {
      const field = form.elements.namedItem('company') as HTMLInputElement
      field.setCustomValidity('고객사 이름을 입력해 주세요.')
      field.reportValidity()
      return
    }
    if (expectedUsers !== undefined && (!Number.isInteger(expectedUsers) || expectedUsers < 1 || expectedUsers > 2147483647)) {
      users.setCustomValidity('사용 인원 범위를 확인해 주세요.')
      users.reportValidity()
      return
    }

    const customerProfile: CustomerProfile = {
      companySize: read('companySize'),
      expectedUsers,
      requestedServices: read('requestedServices'),
      adoptionPurpose: read('adoptionPurpose'),
    }
    const customer = { company, contact: read('contact'), email: read('email'), customerProfile }
    const saved = await change(current => ({
      ...current,
      leads: current.leads.map(row => row.id === lead.id ? { ...row, ...customer } : row),
    }), '고객 정보를 저장했어요.')
    if (saved) setEditing(false)
  }

  return <section className="panel customer-info" aria-label="고객 정보">
    <SectionTitle title="고객 정보">
      <Button onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true"/>고객 정보 편집</Button>
    </SectionTitle>
    <div className="info-content">
      <dl className="info-pairs">
        <div><dt>고객 담당자</dt><dd>{lead.contact || '미등록'}</dd></div>
        <div><dt>이메일</dt><dd>{lead.email || '미등록'}</dd></div>
        <div><dt>기업 규모</dt><dd>{profile?.companySize || '미입력'}</dd></div>
        <div><dt>예상 사용 인원</dt><dd>{profile?.expectedUsers === undefined ? '미입력' : `${userCountFormat.format(profile.expectedUsers)}명`}</dd></div>
        <div><dt>희망 서비스</dt><dd className="customer-multiline">{profile?.requestedServices || '미입력'}</dd></div>
        <div><dt>도입 목적</dt><dd className="customer-multiline">{profile?.adoptionPurpose || '미입력'}</dd></div>
      </dl>
      <h3>문의 요약</h3>
      <p className="message-body">{lead.summary || '등록된 문의 요약이 없어요.'}</p>
    </div>
    {editing && <Modal title="고객 정보 편집" onClose={() => setEditing(false)}>
      <form className="form" onSubmit={save}>
        <label>고객사<input name="company" autoFocus required defaultValue={lead.company} onInput={event => event.currentTarget.setCustomValidity('')}/></label>
        <div className="form-grid">
          <label>고객 담당자<input name="contact" defaultValue={lead.contact}/></label>
          <label>이메일<input type="email" name="email" defaultValue={lead.email}/></label>
        </div>
        <div className="form-grid">
          <label>기업 규모<input name="companySize" defaultValue={profile?.companySize} placeholder="예: 임직원 100~300명"/></label>
          <label>예상 사용 인원<input type="number" name="expectedUsers" min="1" step="1" defaultValue={profile?.expectedUsers} onInput={event => event.currentTarget.setCustomValidity('')}/></label>
        </div>
        <label>희망 서비스<textarea name="requestedServices" rows={2} defaultValue={profile?.requestedServices}/></label>
        <label>도입 목적<textarea name="adoptionPurpose" rows={3} defaultValue={profile?.adoptionPurpose}/></label>
        <div className="form-actions">
          <Button onClick={() => setEditing(false)}>취소</Button>
          <Button type="submit" tone="primary">저장</Button>
        </div>
      </form>
    </Modal>}
  </section>
}
