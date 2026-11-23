import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarDays, ChevronRight, ClipboardList, Pencil, Phone, Plus } from 'lucide-react'
import { dateTime, dueLabel, memberFor, members, sortTasks, stages, type CRM, type Lead, type Stage, type Task } from '../../domain/crm'
import { navigate, type Change } from '../../app/model'
import { Avatar, Badge, Button, Empty, Modal, PageTitle, SearchBox, SectionTitle, Select, TabPanel, Tabs, TextLink } from '../../ui/components'
import { LeadForm } from './LeadForm'
import { CustomerInfo } from './CustomerInfo'
import { TaskForm, Work } from '../work/Work'
import { FilterSelect } from '../../ui/FilterSelect'

const allStages = '전체'
const ownerOptions = members.map(member => ({ value: member.id, label: member.name }))

function leadUrl(id?: string, filters?: URLSearchParams, values?: Record<string, string>) {
  const query = new URLSearchParams()
  for (const key of ['q', 'stage', 'owner']) {
    const value = filters?.get(key)
    if (value) query.set(key, value)
  }
  for (const [key, value] of Object.entries(values ?? {})) query.set(key, value)
  return `/leads${id ? '/' + id : ''}${query.size ? '?' + query : ''}`
}

function TaskDue({ task }: { task: Task }) {
  const label = dueLabel(task.due)
  return label === '기한 초과' || label === '오늘 마감'
    ? <span title={task.due}><Badge>{label}</Badge></span>
    : <span className="date-cell"><CalendarDays size={14} aria-hidden="true"/>{label}</span>
}

export function Leads({ data, params, change }: { data: CRM; params: URLSearchParams; change: Change }) {
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [stage, setStage] = useState(params.get('stage') ?? allStages)
  const [owner, setOwner] = useState(params.get('owner') ?? '')
  const [creating, setCreating] = useState(false)
  const query = params.toString()
  useEffect(() => {
    const filters = new URLSearchParams(query)
    setSearch(filters.get('q') ?? '')
    setStage(filters.get('stage') ?? allStages)
    setOwner(filters.get('owner') ?? '')
  }, [query])

  function filtersFor(q: string, phase: string, ownerId: string) {
    const filters = new URLSearchParams()
    if (q) filters.set('q', q)
    if (phase !== allStages) filters.set('stage', phase)
    if (ownerId) filters.set('owner', ownerId)
    return filters
  }
  function updateFilters(q: string, phase: string, ownerId: string) {
    setSearch(q)
    setStage(phase)
    setOwner(ownerId)
    window.history.replaceState(window.history.state, '', `#${leadUrl(undefined, filtersFor(q, phase, ownerId))}`)
  }
  const filters = filtersFor(search, stage, owner)
  const matching = data.leads.filter(lead => (!owner || owner === lead.ownerId) &&
    `${lead.company} ${lead.title} ${lead.contact}`.toLowerCase().includes(search.trim().toLowerCase()))
  const visible = matching.filter(lead => stage === allStages || lead.stage === stage)
  const openTasks = sortTasks(data.tasks.filter(task => task.status !== '완료'))
  return <>
    <PageTitle title="리드"><Button tone="primary" onClick={() => setCreating(true)}><Plus size={16}/>리드 등록</Button></PageTitle>
    <section className="panel lead-list">
      <div className="stage-filters" role="group" aria-label="영업 단계 필터">
        {[allStages, ...stages].map(phase => <button type="button" key={phase} aria-pressed={stage === phase}
          onClick={() => updateFilters(search, phase, owner)}>
          {phase}<span>{phase === allStages ? matching.length : matching.filter(lead => lead.stage === phase).length}</span>
        </button>)}
      </div>
      <div className="toolbar lead-toolbar">
        <SearchBox value={search} onChange={value => updateFilters(value, stage, owner)} placeholder="고객사, 리드 또는 담당자 검색"/>
        <FilterSelect label="리드 책임자 필터" value={owner} onChange={value => updateFilters(search, stage, value)}
          options={[{ value: '', label: '전체 책임자' }, ...ownerOptions]}/>
        <span className="result-count">총 {visible.length}건</span>
      </div>
      <div className="table-scroll"><table className="data-table">
        <colgroup><col/><col/><col/><col/><col/></colgroup>
        <thead><tr><th scope="col">고객사 / 리드</th><th scope="col">영업 단계</th><th scope="col">책임자</th><th scope="col">다음 업무</th><th scope="col">최근 접촉</th></tr></thead>
        <tbody>{visible.map(lead => {
          const contact = data.activities.find(item => item.leadId === lead.id && (item.type === '통화' || item.type === '미팅'))
          const next = openTasks.find(task => task.leadId === lead.id)
          return <tr key={lead.id}>
            <td><TextLink className="row-title" to={leadUrl(lead.id, filters)}>{lead.company}</TextLink><span className="row-meta">{lead.title}</span></td>
            <td><Badge>{lead.stage}</Badge></td>
            <td><span className="person"><Avatar id={lead.ownerId}/>{memberFor(lead.ownerId).name}</span></td>
            <td>{next ? <div className="next-cell"><TextLink to={leadUrl(lead.id, filters, { tab: '업무', task: next.id })}>{next.title}</TextLink><TaskDue task={next}/></div> : <span className="muted">미정</span>}</td>
            <td className="numeric">{contact ? dateTime(contact.at) : '기록 없음'}</td>
          </tr>
        })}</tbody>
      </table></div>
      {!visible.length && <Empty title="조건에 맞는 리드가 없어요"><Button onClick={() => updateFilters('', allStages, '')}>필터 초기화</Button></Empty>}
    </section>
    {creating && <LeadForm data={data} change={change} onClose={() => setCreating(false)}/>}
  </>
}

const tabs = ['개요', '업무', '활동'] as const

export function LeadDetail({ data, change, lead, params }: { data: CRM; change: Change; lead: Lead; params: URLSearchParams }) {
  const requestedTab = params.get('tab')
  const tab = tabs.find(item => item === requestedTab) ?? tabs[0]
  const [editing, setEditing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const activities = data.activities.filter(item => item.leadId === lead.id)
  const nextTasks = sortTasks(data.tasks.filter(item => item.leadId === lead.id && item.status !== '완료'))
  const latestContact = activities.find(item => item.type === '통화' || item.type === '미팅')
  const stageIndex = stages.indexOf(lead.stage)
  const tabUrl = (name: typeof tabs[number], extra?: Record<string, string>) => leadUrl(lead.id, params, { tab: name, ...extra })
  function changeStage(value: string) {
    if (value === lead.stage) return
    change(prev => ({
      ...prev,
      leads: prev.leads.map(item => item.id === lead.id ? { ...item, stage: value as Stage } : item),
      activities: [{ id: crypto.randomUUID(), leadId: lead.id, type: '단계 변경', text: `${lead.stage} → ${value}`, authorId: data.activeMemberId, at: new Date().toISOString() }, ...prev.activities],
    }), '영업 단계를 변경했어요.')
  }
  function logActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = String(form.get('text')).trim()
    if (!text) return
    change(prev => ({ ...prev, activities: [{ id: crypto.randomUUID(), leadId: lead.id, type: String(form.get('type')) as '통화' | '미팅' | '메모', text, authorId: data.activeMemberId, at: new Date().toISOString() }, ...prev.activities] }), '영업 활동을 기록했어요.')
    setRecording(false)
  }
  const recordActivity = <Button onClick={() => setRecording(true)}><Phone size={15}/>활동 기록</Button>
  return <>
    <TextLink className="back-link lead-back" to={leadUrl(undefined, params)}><ArrowLeft size={16}/>리드 목록</TextLink>
    <PageTitle title={lead.company} subtitle={<span className="lead-title-line">
      <span>{lead.title}</span>
      <Button tone="quiet" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true"/>리드 수정</Button>
    </span>}/>
    <section className="panel lead-status" aria-label="영업 진행과 책임자">
      <div className="lead-status-controls">
        <label>영업 단계<Select label="영업 단계" value={lead.stage} options={stages} onChange={changeStage}/></label>
        <label>리드 책임자<Select label="리드 책임자" value={lead.ownerId} options={ownerOptions}
          onChange={ownerId => change(prev => ({ ...prev, leads: prev.leads.map(item => item.id === lead.id ? { ...item, ownerId } : item) }), '리드 책임자를 변경했어요.')}/></label>
      </div>
      <ol className="lead-stage-track" aria-label="영업 진행 순서">
        {stages.map((name, index) => <li key={name} aria-current={name === lead.stage ? 'step' : undefined}
          className={index < stageIndex ? 'stage-passed' : ''}>{name}</li>)}
      </ol>
    </section>
    <section className="panel lead-tabs">
      <Tabs tabs={tabs} current={tab} label="리드 상세" onChange={value => {
        const nextTab = tabs.find(name => name === value)
        if (nextTab && nextTab !== tab) navigate(tabUrl(nextTab))
      }}/>
    </section>
    <TabPanel tabs={tabs} current={tab}>
      {tab === '개요' && <div className="dashboard-grid lead-overview">
        <CustomerInfo lead={lead} change={change}/>
        <div className="stack">
          <section className="panel">
            <SectionTitle title="다음 업무" count={nextTasks.length}>
              <div className="lead-section-actions">
                <TextLink className="more-link" to={tabUrl('업무')}>전체 업무 보기</TextLink>
                <Button onClick={() => setAddingTask(true)}><Plus size={15}/>업무 추가</Button>
              </div>
            </SectionTitle>
            {nextTasks.length ? <div className="mini-list">{nextTasks.slice(0, 3).map(task =>
              <a className="mini-row" key={task.id} href={`#${tabUrl('업무', { task: task.id })}`}>
                <span className="mini-icon mail-icon"><ClipboardList size={16}/></span>
                <span className="mini-text"><strong>{task.title}</strong><span>{memberFor(task.assigneeId).name} · {task.status}</span></span>
                <TaskDue task={task}/><ChevronRight size={15} className="row-chevron"/>
              </a>)}</div> : <Empty title="예정된 업무가 없어요"/>}
          </section>
          <section className="panel">
            <SectionTitle title="최근 접촉">
              <div className="lead-section-actions">
                <TextLink className="more-link" to={tabUrl('활동')}>활동 이력 보기</TextLink>
                {recordActivity}
              </div>
            </SectionTitle>
            {latestContact ? <div className="info-content recent-contact">
              <div><Badge>{latestContact.type}</Badge><span className="muted">{dateTime(latestContact.at)} · {memberFor(latestContact.authorId).name}</span></div>
              <p className="message-body">{latestContact.text}</p>
            </div> : <Empty title="아직 접촉 기록이 없어요"/>}
          </section>
        </div>
      </div>}
      {tab === '업무' && <Work key={params.get('task') ?? lead.id} data={data} change={change} leadId={lead.id} taskId={params.get('task')}/>}
      {tab === '활동' && <section className="panel"><SectionTitle title="활동 이력" count={activities.length}>{recordActivity}</SectionTitle>
        {activities.length ? <div className="mini-list">{activities.map(item => <div key={item.id} className="mini-row"><Badge>{item.type}</Badge><span className="mini-text"><strong>{item.text}</strong><span>{memberFor(item.authorId).name} · {dateTime(item.at)}</span></span></div>)}</div> : <Empty title="아직 활동 기록이 없어요" detail="고객과의 통화나 미팅을 기록할 수 있어요."/>}
      </section>}
    </TabPanel>
    {editing && <LeadForm data={data} change={change} lead={lead} onClose={() => setEditing(false)}/>}
    {addingTask && <TaskForm data={data} change={change} leadId={lead.id} onClose={() => setAddingTask(false)}/>}
    {recording && <Modal title="영업 활동 기록" onClose={() => setRecording(false)}><form className="form" onSubmit={logActivity}><label>활동 유형<select name="type"><option>통화</option><option>미팅</option><option>메모</option></select></label><label>기록 내용<textarea autoFocus name="text" required rows={5} placeholder="접촉 결과와 후속 조치를 남겨 주세요."/></label><div className="form-actions"><Button onClick={() => setRecording(false)}>취소</Button><Button type="submit" tone="primary">기록 저장</Button></div></form></Modal>}
  </>
}
