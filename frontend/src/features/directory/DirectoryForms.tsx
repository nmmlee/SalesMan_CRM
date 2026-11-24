import { useState, type FormEvent } from 'react'
import { navigate, type SaveDirectory } from '../../app/model'
import { lossMemoType, type Company, type Contact, type CRM, type Mail, type TouchType } from '../../domain/crm'
import { companyFields, contactFields, directoryNoteLimit, nameKey, type DirectoryChange } from '../../domain/directory'
import { FormActions, Modal, NoteField } from '../../ui/components'
import { recordedAt, RecordFields } from '../../ui/RecordFields'

const newRecord = 'new'

function readForm(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  return (name: string) => String(form.get(name) ?? '').trim()
}

function readCompany(read: ReturnType<typeof readForm>, notes?: string) {
  return companyFields({ name: read('company'), legalNumber: read('legalNumber'), businessNumber: read('businessNumber'), website: read('website'), notes })
}

function readContact(read: ReturnType<typeof readForm>, notes?: string) {
  return contactFields({ name: read('contact'), email: read('email'), phone: read('phone'), position: read('position'), notes })
}

function CompanyFields({ company, name }: { company?: Company; name?: string }) {
  return <>
    <label>기업명<input name="company" required maxLength={200} defaultValue={company?.name ?? name}/></label>
    <div className="form-grid">
      <label>법인번호<input name="legalNumber" inputMode="numeric" defaultValue={company?.legalNumber}/></label>
      <label>사업자등록번호<input name="businessNumber" inputMode="numeric" defaultValue={company?.businessNumber}/></label>
    </div>
    <label>웹사이트<input name="website" maxLength={300} defaultValue={company?.website}/></label>
  </>
}

function ContactFields({ contact, mail }: { contact?: Contact; mail?: Mail }) {
  return <>
    <div className="form-grid">
      <label>담당자 이름<input name="contact" required maxLength={200} defaultValue={contact?.name ?? (mail?.sender || mail?.email)}/></label>
      <label>직함<input name="position" maxLength={120} defaultValue={contact?.position}/></label>
    </div>
    <div className="form-grid">
      <label>이메일<input name="email" type="email" maxLength={254} defaultValue={contact?.email ?? mail?.email}/></label>
      <label>연락처<input name="phone" type="tel" maxLength={60} defaultValue={contact?.phone}/></label>
    </div>
  </>
}

function companyLabel(company: Company) {
  const registration = company.legalNumber || company.businessNumber
  return registration ? `${company.name} · ${registration}` : company.name
}

function CompanyOptions({ companies }: { companies: Company[] }) {
  return <>{companies.map(company => <option key={company.id} value={company.id}>{companyLabel(company)}</option>)}</>
}

function useSave(save: SaveDirectory, onSaved: (id?: string) => void) {
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(build: () => DirectoryChange, message: string) {
    setError('')
    setSaving(true)
    try {
      const result = await save(build(), message)
      if (result) onSaved(result.id)
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return { submit, error, saving }
}

type FormProps = { save: SaveDirectory; onClose: () => void }

export function CompanyForm({ company, save, onClose }: FormProps & { company?: Company }) {
  const [original] = useState(company)
  const { submit, ...state } = useSave(save, id => {
    onClose()
    if (!original && id) navigate(`/companies/${id}`)
  })
  return <Modal title={original ? '기업 정보 수정' : '기업 등록'} onClose={onClose}>
    <form className="form" onSubmit={event => {
      const read = readForm(event)
      void submit(() => ({ kind: 'company', company: { id: original?.id ?? crypto.randomUUID(), version: original?.version, ...readCompany(read, read('notes')) } }), '기업 정보를 저장했어요.')
    }}>
      <CompanyFields company={original}/>
      <NoteField label="비고" name="notes" placeholder="기업에 대해 참고할 내용을 남겨 주세요." initialValue={original?.notes} required={false} maxLength={directoryNoteLimit}/>
      <FormActions {...state} onCancel={onClose}/>
    </form>
  </Modal>
}

export function ContactForm({ contact, companies, initialCompanyId, save, onClose }: FormProps & { contact?: Contact; companies: Company[]; initialCompanyId?: string }) {
  const [original] = useState(contact)
  const { submit, ...state } = useSave(save, id => {
    onClose()
    if (!original && id) navigate(`/contacts/${id}`)
  })
  return <Modal title={original ? '담당자 정보 수정' : '담당자 등록'} onClose={onClose}>
    <form className="form" onSubmit={event => {
      const read = readForm(event)
      void submit(() => ({
        kind: 'contact', contact: { id: original?.id ?? crypto.randomUUID(), version: original?.version, companyId: original?.companyId ?? read('companyId'), ...readContact(read, read('notes')) },
      }), '담당자 정보를 저장했어요.')
    }}>
      <label>기업<select name="companyId" required disabled={!!original} defaultValue={original?.companyId ?? initialCompanyId ?? ''}>
        <option value="" disabled>기업 선택</option><CompanyOptions companies={companies}/>
      </select></label>
      <ContactFields contact={original}/>
      <NoteField label="비고" name="notes" placeholder="담당자에 대해 참고할 내용을 남겨 주세요." initialValue={original?.notes} required={false} maxLength={directoryNoteLimit}/>
      <FormActions {...state} onCancel={onClose}/>
    </form>
  </Modal>
}

export function MailLinkForm({ data, mail, save, onClose }: FormProps & { data: CRM; mail: Mail }) {
  const [version] = useState(mail.version)
  const [initial] = useState(() => {
    const byCompany = mail.company ? data.companies.filter(row => nameKey(row.name) === nameKey(mail.company)) : []
    const byEmail = mail.email ? data.contacts.filter(row => nameKey(row.email) === nameKey(mail.email)) : []
    const companyId = byCompany.length === 1 ? byCompany[0].id : (!mail.company && byEmail.length === 1 ? byEmail[0].companyId : newRecord)
    return { companyId, contactId: byEmail.find(row => row.companyId === companyId)?.id ?? newRecord }
  })
  const [companyId, setCompanyId] = useState(initial.companyId)
  const [contactId, setContactId] = useState(initial.contactId)
  const contacts = data.contacts.filter(row => row.companyId === companyId)
  const { submit, ...state } = useSave(save, onClose)
  return <Modal title="메일에서 기업·담당자 등록" onClose={onClose}>
    <form className="form" onSubmit={event => {
      const read = readForm(event)
      void submit(() => {
        const company = companyId === newRecord ? { id: crypto.randomUUID(), ...readCompany(read) } : data.companies.find(row => row.id === companyId)
        if (!company) throw new Error('연결할 기업을 선택해 주세요.')
        const contact = contactId === newRecord ? { id: crypto.randomUUID(), companyId: company.id, ...readContact(read) } : contacts.find(row => row.id === contactId)
        if (!contact) throw new Error('연결할 담당자를 선택해 주세요.')
        return { kind: 'linkMail', mailId: mail.id, version, company, contact }
      }, '메일을 기업과 담당자에 연결했어요.')
    }}>
      <label>기업<select value={companyId} onChange={event => {
        const id = event.target.value
        setCompanyId(id)
        setContactId(data.contacts.find(row => row.companyId === id && mail.email && nameKey(row.email) === nameKey(mail.email))?.id ?? newRecord)
      }}>
        <option value={newRecord}>새 기업 등록</option><CompanyOptions companies={data.companies}/>
      </select></label>
      {companyId === newRecord && <CompanyFields name={mail.company}/>}
      {companyId !== newRecord && <label>담당자<select value={contactId} onChange={event => setContactId(event.target.value)}>
        <option value={newRecord}>새 담당자 등록</option>
        {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}{contact.email && ` · ${contact.email}`}</option>)}
      </select></label>}
      {contactId === newRecord && <ContactFields mail={mail}/>}
      <FormActions {...state} label="메일 연결" onCancel={onClose}/>
    </form>
  </Modal>
}

export function TouchForm({ companyId, contactId, save, onClose }: FormProps & { companyId: string; contactId?: string }) {
  const { submit, ...state } = useSave(save, onClose)
  return <Modal title="접촉 기록 추가" onClose={onClose}>
    <form className="form record-form" onSubmit={event => {
      const read = readForm(event)
      void submit(() => {
        const text = read('text')
        if (!text) throw new Error('접촉 내용을 입력해 주세요.')
        return { kind: 'touch', touch: { id: crypto.randomUUID(), companyId, contactId, type: read('type') as TouchType, text, at: recordedAt(read('at')) } }
      }, '접촉 이력을 저장했어요.')
    }}>
      <RecordFields typeLabel="접촉 유형" dateLabel="접촉 시각"/>
      <NoteField label="접촉 내용" placeholder="어떤 이야기를 나눴나요? 접촉 결과나 다음 할 일을 남겨 주세요." maxLength={4000}/>
      <FormActions {...state} label="접촉 기록 저장" onCancel={onClose}/>
    </form>
  </Modal>
}

export function ContactLossMemoForm({ contact, save, onClose }: FormProps & { contact: Contact }) {
  const { submit, ...state } = useSave(save, onClose)
  return <Modal title="로스트 메모" onClose={onClose}>
    <form className="form record-form" onSubmit={event => {
      const read = readForm(event)
      void submit(() => {
        const text = read('text')
        if (!text) throw new Error('로스트 메모를 입력해 주세요.')
        return { kind: 'touch', touch: { id: crypto.randomUUID(), companyId: contact.companyId, contactId: contact.id, type: lossMemoType, text, at: new Date().toISOString() } }
      }, '담당자 타임라인에 로스트 메모를 저장했어요.')
    }}>
      <NoteField label="로스트 메모 내용" placeholder="논의를 진행하기 어려웠던 이유나 다시 연락할 조건을 남겨 주세요." maxLength={4000}/>
      <FormActions {...state} label="로스트 메모 저장" onCancel={onClose}/>
    </form>
  </Modal>
}
