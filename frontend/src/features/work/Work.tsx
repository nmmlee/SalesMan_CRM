import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { type CRM, type Task, type TaskStatus, dueLabel, memberFor, shortDate, sortTasks, taskStatuses, upsert } from '../../domain/crm'
import type { Change } from '../../app/model'
import { Avatar, Badge, Button, Empty, Modal, PageTitle, SearchBox, SectionTitle, TabPanel, Tabs, TextLink } from '../../ui/components'
import { FilterSelect } from '../../ui/FilterSelect'

const statusTones = { 대기: 'neutral', '진행 중': 'info', 완료: 'warning' } as const
const statusOptions = taskStatuses.map(status => ({ value: status, label: status, tone: statusTones[status] }))

export function TaskTable({ data, tasks, change, compact = false, onEdit, onDelete }: {
  data: CRM; tasks: Task[]; change: Change; compact?: boolean; onEdit?: (task: Task) => void; onDelete?: (task: Task) => void
}) {
  if (!tasks.length) return <Empty title="표시할 업무가 없어요" detail="배정된 업무나 검색 조건을 확인해 주세요." />
  return <div className="table-scroll"><table className="data-table">
    <thead><tr><th scope="col">업무</th>{!compact && <th scope="col">담당자</th>}<th scope="col">상태</th><th scope="col">기한</th>
      {onDelete && <th scope="col" className="task-actions-cell" aria-label="삭제"/>}</tr></thead>
    <tbody>{tasks.map(task => {
      const lead = data.leads.find(row => row.id === task.leadId)
      const due = dueLabel(task.due)
      return <tr key={task.id}>
        <td>{onEdit ? <button type="button" className="row-title row-button" onClick={() => onEdit(task)}>{task.title}</button> : <TextLink className="row-title" to={`/leads/${task.leadId}?tab=업무&task=${task.id}`}>{task.title}</TextLink>}
          {lead && <TextLink className="row-meta" to={`/leads/${lead.id}`}>{lead.company}</TextLink>}</td>
        {!compact && <td><span className="person"><Avatar member={memberFor(data, task.assigneeId)}/>{memberFor(data, task.assigneeId).name}</span></td>}
        <td>{onEdit ? <FilterSelect label={`${task.title} 상태`} menuTitle="업무 상태" value={task.status}
          options={statusOptions} compact onChange={value => change(current => ({
            ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, status: value as TaskStatus } : item),
          }), '업무 상태를 변경했어요.')}/> : <Badge>{task.status}</Badge>}</td>
        <td>{task.status !== '완료' && (due === '기한 초과' || due === '오늘 마감') ? <span title={task.due}><Badge>{due}</Badge></span> : <span className="date-cell"><CalendarDays size={14} aria-hidden="true"/>{shortDate(task.due)}</span>}</td>
        {onDelete && <td className="task-actions-cell">
          <button type="button" className="icon-button task-delete" aria-label={`${task.title} 삭제`} title="업무 삭제" onClick={() => onDelete(task)}>
            <Trash2 size={16} aria-hidden="true"/>
          </button>
        </td>}
      </tr>
    })}</tbody>
  </table></div>
}

export function TaskForm({ data, change, task, leadId, onClose }: { data: CRM; change: Change; task?: Task; leadId?: string; onClose: () => void }) {
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? '대기')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title')).trim()
    if (!title) return
    const next: Task = {
      id: task?.id ?? crypto.randomUUID(), title, leadId: leadId ?? String(form.get('lead')),
      assigneeId: String(form.get('assignee')), due: String(form.get('due')), status,
    }
    if (await change(prev => ({ ...prev, tasks: upsert(prev.tasks, next) }), task ? '업무를 수정했어요.' : '업무를 배정했어요.')) onClose()
  }
  return <Modal title={task ? '업무 수정' : '업무 추가'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>업무명<input autoFocus name="title" defaultValue={task?.title} required maxLength={100} placeholder="예: 제품 데모 일정 정하기"/></label>
        {!leadId && <label>관련 리드<select name="lead" defaultValue={task?.leadId ?? ''} required><option value="" disabled>리드 선택</option>{data.leads.map(lead => <option key={lead.id} value={lead.id}>{lead.company} · {lead.title}</option>)}</select></label>}
        <div className="form-grid">
          <label>담당자<select name="assignee" defaultValue={task?.assigneeId ?? data.activeMemberId}>{data.members.filter(member => member.active !== false || member.id === task?.assigneeId).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label>기한<input type="date" name="due" defaultValue={task?.due}/></label>
        </div>
        <div className="form-field">
          <span>상태</span>
          <FilterSelect label="상태" value={status} options={statusOptions} compact onChange={value => setStatus(value as TaskStatus)}/>
        </div>
        <div className={`form-actions${task ? ' task-editor-actions' : ''}`}>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" tone="primary">저장</Button>
        </div>
      </form>
  </Modal>
}

const workTabs = ['내 업무', '팀 업무'] as const
export function Work({ data, change, leadId, due, taskId }: { data: CRM; change: Change; leadId?: string; due?: string | null; taskId?: string | null }) {
  const [tab, setTab] = useState<string>(workTabs[0])
  const [status, setStatus] = useState('전체 상태')
  const [assignee, setAssignee] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Task | 'new' | null>(() => data.tasks.find(task => task.id === taskId && task.leadId === leadId) ?? null)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  const [deadline, setDeadline] = useState(due || '전체 기한')
  const workPanel = useRef<HTMLElement>(null)
  useEffect(() => setDeadline(due || '전체 기한'), [due])
  const visible = sortTasks(data.tasks.filter(task => {
    if (leadId) return task.leadId === leadId
    const company = data.leads.find(lead => lead.id === task.leadId)?.company ?? ''
    return (tab === '내 업무' ? task.assigneeId === data.activeMemberId : !assignee || task.assigneeId === assignee) &&
      (status === '전체 상태' || status === task.status) &&
      (deadline === '전체 기한' || task.status !== '완료' && dueLabel(task.due) === deadline) &&
      `${task.title} ${company}`.toLowerCase().includes(search.trim().toLowerCase())
  }))
  const table = <TaskTable data={data} tasks={visible} change={change} onEdit={setEditor} onDelete={setPendingDelete}/>
  const add = <Button tone="primary" onClick={() => setEditor('new')}><Plus size={16}/>업무 추가</Button>
  return <>
    {!leadId && <PageTitle title="업무">{add}</PageTitle>}
    <section className="panel" ref={workPanel} tabIndex={-1} aria-label={leadId ? '후속 업무 목록' : '업무 목록'}>
      {leadId ? <><SectionTitle title="후속 업무" count={visible.length}>{add}</SectionTitle>{table}</> : <>
        <Tabs tabs={workTabs} current={tab} onChange={setTab} label="업무 범위" />
        <TabPanel tabs={workTabs} current={tab}><div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="업무 또는 고객사 검색"/>
          <FilterSelect value={status} onChange={setStatus} options={['전체 상태', ...taskStatuses]} label="업무 상태 필터"/>
          <FilterSelect value={deadline} onChange={setDeadline} options={['전체 기한', '오늘 마감', '기한 초과']} label="업무 기한 필터"/>
          {tab === '팀 업무' && <FilterSelect value={assignee} onChange={setAssignee} options={[{ value: '', label: '전체 담당자' }, ...data.members.map(member => ({ value: member.id, label: member.name }))]} label="담당자 필터"/>}
          <span className="result-count">총 {visible.length}건</span>
        </div>{table}</TabPanel>
      </>}
    </section>
    {editor && <TaskForm data={data} change={change} task={editor === 'new' ? undefined : editor} leadId={leadId} onClose={() => setEditor(null)}/>}
    {pendingDelete && <Modal title="업무를 삭제할까요?" onClose={() => setPendingDelete(null)}>
      <div className="form">
        <p><strong>{pendingDelete.title}</strong> 업무를 삭제하면 복구할 수 없어요.</p>
        <div className="form-actions">
          <Button autoFocus onClick={() => setPendingDelete(null)}>취소</Button>
          <Button tone="danger" onClick={async () => {
            if (!await change(current => ({ ...current, tasks: current.tasks.filter(item => item.id !== pendingDelete.id) }), '업무를 삭제했어요.')) return
            setPendingDelete(null)
            requestAnimationFrame(() => workPanel.current?.focus({ preventScroll: true }))
          }}>업무 삭제</Button>
        </div>
      </div>
    </Modal>}
  </>
}
