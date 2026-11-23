import { useState, type FormEvent } from 'react'
import { FilePenLine, Plus } from 'lucide-react'
import { applyTemplate, dateTime, memberFor, upsert, type CRM, type Draft, type Lead, type Template } from '../../domain/crm'
import type { Change } from '../../app/model'
import { Avatar, Button, Empty, Modal, PageTitle, SectionTitle } from '../../ui/components'

function DraftEditor({ data, change, lead, draft, onClose }: { data: CRM; change: Change; lead: Lead; draft?: Draft; onClose: () => void }) {
  const member = memberFor(data.activeMemberId)
  const templates = data.templates.filter(item => item.ownerId === member.id)
  const recipients = [...new Set([lead.email, ...data.mails.filter(mail => mail.leadId === lead.id).map(mail => mail.email)].filter(Boolean))]
  const [from, setFrom] = useState(draft?.from ?? data.profiles[member.id] ?? '')
  const [to, setTo] = useState(draft?.to ?? (recipients.length === 1 ? recipients[0] : ''))
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [body, setBody] = useState(draft?.body ?? '')
  const [templateId, setTemplate] = useState(draft?.templateId ?? '')
  const [pendingTemplate, setPendingTemplate] = useState<Template>()
  const [error, setError] = useState('')
  function fill(template: Template) {
    setTemplate(template.id)
    setSubject(applyTemplate(template.subject, lead, member))
    setBody(applyTemplate(template.body, lead, member))
    setPendingTemplate(undefined)
    setError('')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!subject.trim() || !body.trim()) {
      setError('제목과 본문을 입력해 주세요.')
      return
    }
    const next = { id: draft?.id ?? crypto.randomUUID(), ownerId: member.id, leadId: lead.id, from: from.trim(), to: to.trim(), subject: subject.trim(), body, updatedAt: new Date().toISOString(), templateId }
    change(prev => ({ ...prev, drafts: upsert(prev.drafts, next) }), '메일 초안을 저장했어요.')
    onClose()
  }
  return <Modal title={draft ? '메일 초안 수정' : '메일 초안 만들기'} onClose={onClose}><form className="form" onSubmit={submit}>
    <p className="muted">{lead.company} · {lead.title}</p>
    <div className="form-grid">
      <label>발신 주소<input type="email" value={from} onChange={event => setFrom(event.target.value)} placeholder="업무용 메일 주소"/></label>
      <label>수신자<input type="email" list="draft-recipients" value={to} onChange={event => setTo(event.target.value)} placeholder="메일 주소 선택 또는 입력"/></label>
      <datalist id="draft-recipients">{recipients.map(email => <option key={email} value={email}/>)}</datalist>
    </div>
    <label>메일 템플릿<select value={templateId} onChange={event => {
      const template = templates.find(item => item.id === event.target.value)
      if (!template) { setTemplate(''); setPendingTemplate(undefined); return }
      if (body.trim() || subject.trim()) setPendingTemplate(template)
      else fill(template)
    }}><option value="">{templates.length ? '템플릿 선택' : '저장된 템플릿 없음'}</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    {pendingTemplate && <div className="inline-notice">작성 중인 내용을 ‘{pendingTemplate.name}’으로 바꿀까요?<div><Button onClick={() => setPendingTemplate(undefined)}>유지</Button><Button onClick={() => fill(pendingTemplate)}>템플릿 적용</Button></div></div>}
    <label>제목<input required value={subject} onChange={event => setSubject(event.target.value)}/></label>
    <label>본문<textarea required rows={7} value={body} onChange={event => setBody(event.target.value)}/></label>
    {(subject.includes('[입력 필요:') || body.includes('[입력 필요:')) && <div className="inline-notice" role="status">‘입력 필요’로 표시된 정보를 확인해 주세요.</div>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="form-actions"><Button onClick={onClose}>취소</Button><Button type="submit" tone="primary">초안 저장</Button></div>
  </form></Modal>
}

export function Profile({ data, change }: { data: CRM; change: Change }) {
  const member = memberFor(data.activeMemberId)
  const [choosingLead, setChoosingLead] = useState(false)
  const [editor, setEditor] = useState<{ leadId: string; draft?: Draft }>()
  const lead = data.leads.find(item => item.id === editor?.leadId)
  const drafts = data.drafts.filter(item => item.ownerId === member.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return <>
    <PageTitle title="마이페이지" subtitle="내 업무용 메일 주소와 저장한 초안을 관리하세요."/>
    <section className="panel profile-panel"><SectionTitle title="내 프로필"/>
      <div className="profile-identity"><Avatar id={member.id} size="avatar-large"/><div><strong>{member.name}</strong><span>{member.role}</span></div></div>
      <form className="form profile-form" onSubmit={event => {
        event.preventDefault()
        const email = String(new FormData(event.currentTarget).get('email')).trim()
        change(prev => ({ ...prev, profiles: { ...prev.profiles, [member.id]: email } }), '업무용 메일 주소를 저장했어요.')
      }}><label>개인 업무용 메일 주소<input type="email" name="email" defaultValue={data.profiles[member.id]} placeholder="name@company.com"/></label><Button type="submit" tone="primary">주소 저장</Button></form>
    </section>
    <section className="panel">
      <SectionTitle title="내 메일 초안" count={drafts.length}>
        <Button disabled={!data.leads.length} onClick={() => setChoosingLead(true)}><Plus size={16}/>메일 초안 만들기</Button>
      </SectionTitle>
      {drafts.length ? <div className="mini-list">{drafts.map(draft => <div key={draft.id} className="mini-row">
        <span className="mini-icon activity-icon"><FilePenLine size={17}/></span>
        <span className="mini-text">
          <button type="button" className="row-title row-button" onClick={() => setEditor({ leadId: draft.leadId, draft })}>{draft.subject}</button>
          <span>{dateTime(draft.updatedAt)}</span>
        </span>
      </div>)}</div> : <Empty title="저장된 초안이 없어요"/>}
    </section>
    {choosingLead && <Modal title="초안에 연결할 리드 선택" onClose={() => setChoosingLead(false)}>
      <form className="form" onSubmit={event => {
        event.preventDefault()
        const leadId = String(new FormData(event.currentTarget).get('lead') ?? '')
        if (!data.leads.some(item => item.id === leadId)) return
        setChoosingLead(false)
        setEditor({ leadId })
      }}>
        <label>관련 리드<select autoFocus name="lead" required defaultValue="">
          <option value="" disabled>리드 선택</option>
          {data.leads.map(item => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}
        </select></label>
        <div className="form-actions">
          <Button onClick={() => setChoosingLead(false)}>취소</Button>
          <Button type="submit" tone="primary">계속</Button>
        </div>
      </form>
    </Modal>}
    {editor && lead && <DraftEditor data={data} change={change} lead={lead} draft={editor.draft} onClose={() => setEditor(undefined)}/>}
  </>
}
