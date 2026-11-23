import { useState, type FormEvent } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { upsert, type CRM, type Template } from '../../domain/crm'
import type { Change } from '../../app/model'
import { Button, Empty, Modal } from '../../ui/components'

export function Templates({ data, change }: { data: CRM; change: Change }) {
  const memberId = data.activeMemberId
  const [editor, setEditor] = useState<Template | 'new' | null>(null)
  const templates = data.templates.filter(item => item.ownerId === memberId)
  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name')).trim()
    const subject = String(form.get('subject')).trim()
    const body = String(form.get('body')).trim()
    if (!name || !subject || !body) return
    const next = { id: editor && editor !== 'new' ? editor.id : crypto.randomUUID(), ownerId: memberId, name, subject, body }
    if (await change(prev => ({ ...prev, templates: upsert(prev.templates, next) }), '템플릿을 저장했어요.')) setEditor(null)
  }
  return <>
    <section className="template-tools" aria-label="내 메일 템플릿">
      <details className="template-list">
        <summary><ChevronDown size={15} aria-hidden="true"/>내 메일 템플릿<span>{templates.length}개</span></summary>
        {templates.length ? <ul>{templates.map(template => <li key={template.id} className="mini-row">
          <span className="mini-text"><strong>{template.name}</strong><span>{template.subject}</span></span>
          <Button tone="quiet" aria-label={`${template.name} 편집`} onClick={() => setEditor(template)}>편집</Button>
        </li>)}</ul> : <Empty title="저장된 템플릿이 없어요"/>}
      </details>
      <Button tone="quiet" onClick={() => setEditor('new')}><Plus size={15}/>템플릿 만들기</Button>
    </section>
    {editor && <Modal title={editor === 'new' ? '메일 템플릿 만들기' : '메일 템플릿 편집'} onClose={() => setEditor(null)}><form className="form" onSubmit={saveTemplate}>
      <label>템플릿 이름<input name="name" autoFocus required defaultValue={editor === 'new' ? '' : editor.name} placeholder="예: 첫 회신"/></label>
      <label>제목<input name="subject" required defaultValue={editor === 'new' ? '' : editor.subject}/></label>
      <label>본문<textarea name="body" required rows={6} defaultValue={editor === 'new' ? '' : editor.body}/></label>
      <div className="inline-notice">사용할 수 있는 항목 <code>{'{{고객사명}} · {{담당자명}} · {{내이름}}'}</code></div>
      <div className="form-actions"><Button onClick={() => setEditor(null)}>취소</Button><Button type="submit" tone="primary">템플릿 저장</Button></div>
    </form></Modal>}
  </>
}
