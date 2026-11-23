import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CircleAlert, Inbox as InboxIcon, Mail as MailIcon, Plus, RefreshCw } from 'lucide-react'
import { dateTime, mailStatus, type CRM } from '../../domain/crm'
import type { Change } from '../../app/model'
import { Badge, Button, Empty, PageTitle, SearchBox, SectionTitle, TextLink } from '../../ui/components'
import { FilterSelect } from '../../ui/FilterSelect'
import { LeadForm } from '../leads/LeadForm'

export function SyncBanner({ data, syncMailbox }: { data: CRM; syncMailbox: () => void }) {
  const { status, lastSuccess } = data.mailbox
  const connected = status === 'ready' || status === 'working' || status === 'failed'
  const copy = { disconnected: '공용 메일이 연결되지 않았어요', ready: '공용 메일 자동 수집 연결됨', working: '메일을 가져오는 중', failed: '메일을 가져오지 못했어요', reconnect: '메일 연결을 확인해 주세요' }[status]
  return <section className={`sync-banner sync-${status}`} aria-label="메일 동기화 상태"><span className="sync-icon">{status === 'failed' || status === 'reconnect' ? <CircleAlert size={18}/> : <InboxIcon size={18}/>}</span>
    <div role="status"><strong>{copy}</strong><span>{lastSuccess ? `마지막 성공 ${dateTime(lastSuccess)}` : '아직 동기화 기록이 없어요'}</span></div>
    {connected ? <Button onClick={syncMailbox} disabled={status === 'working'}><RefreshCw size={15} className={status === 'working' ? 'spinning' : ''}/>{status === 'failed' ? '다시 시도' : '지금 동기화'}</Button> : <TextLink to="/settings" className="button button-secondary">팀 설정</TextLink>}
  </section>
}

export function Inbox({ data, change, id, params, syncMailbox }: { data: CRM; change: Change; id?: string; params: URLSearchParams; syncMailbox: () => void }) {
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [status, setStatus] = useState(() => params.get('status') ?? '전체 상태')
  const [oldest, setOldest] = useState(false)
  const [creatingLead, setCreatingLead] = useState(false)
  const listScroll = useRef<number | undefined>(undefined)
  const query = params.toString()
  useLayoutEffect(() => {
    if (!window.matchMedia('(max-width: 1279px)').matches) return
    if (id && listScroll.current === undefined) {
      listScroll.current = window.scrollY
      window.scrollTo(0, 0)
    } else if (!id && listScroll.current !== undefined) {
      window.scrollTo(0, listScroll.current)
      listScroll.current = undefined
    }
  }, [id])
  useEffect(() => {
    const current = new URLSearchParams(query)
    setSearch(current.get('q') ?? '')
    setStatus(current.get('status') ?? '전체 상태')
  }, [query])
  const selected = data.mails.find(mail => mail.id === id)
  const visible = data.mails.filter(mail => (status === '전체 상태' || mailStatus(mail) === status) && `${mail.subject} ${mail.sender} ${mail.company} ${mail.email}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => oldest ? a.receivedAt.localeCompare(b.receivedAt) : b.receivedAt.localeCompare(a.receivedAt))

  function url(mailId?: string, nextSearch = search, nextStatus = status) {
    const filters = new URLSearchParams()
    if (nextSearch) filters.set('q', nextSearch)
    if (nextStatus !== '전체 상태') filters.set('status', nextStatus)
    return `/inbox${mailId ? '/' + mailId : ''}${filters.size ? '?' + filters : ''}`
  }
  function changeFilters(nextSearch: string, nextStatus: string) {
    setSearch(nextSearch)
    setStatus(nextStatus)
    window.history.replaceState(window.history.state, '', `#${url(id, nextSearch, nextStatus)}`)
  }
  return <>
    <PageTitle title="문의함"/>
    <SyncBanner data={data} syncMailbox={syncMailbox}/>
    <div className={`inbox-grid ${selected ? 'with-detail' : ''}`}>
      <section className="panel inbox-list">
        <SectionTitle title="문의 목록" count={visible.length}/>
        <div className="toolbar"><SearchBox value={search} onChange={value => changeFilters(value, status)} placeholder="제목, 발신자 또는 고객사 검색"/><FilterSelect value={status} onChange={value => changeFilters(search, value)} label="문의 상태 필터" options={['전체 상태', '검토 대기', '리드 연결됨', '처리 제외']}/></div>
        {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">문의</th><th scope="col">상태</th><th scope="col" aria-sort={oldest ? 'ascending' : 'descending'}><button type="button" className="sort-button" onClick={() => setOldest(value => !value)}>수신 시각 {oldest ? <ArrowUp size={14}/> : <ArrowDown size={14}/>}</button></th></tr></thead><tbody>
          {visible.map(mail => <tr className={mail.id === id ? 'selected-row' : ''} key={mail.id}><td><TextLink className="row-title" to={url(mail.id)}>{mail.subject}</TextLink><span className="row-meta">{mail.company} · {mail.sender}</span></td><td><Badge>{mailStatus(mail)}</Badge></td><td className="numeric">{dateTime(mail.receivedAt)}</td></tr>)}
        </tbody></table></div> : <Empty title={search || status !== '전체 상태' ? '조건에 맞는 메일이 없어요' : '아직 들어온 메일이 없어요'}>{(search || status !== '전체 상태') && <Button onClick={() => changeFilters('', '전체 상태')}>필터 초기화</Button>}</Empty>}
      </section>
      {selected && <section className="panel mail-detail" aria-label="메일 상세">
        <div className="mail-heading"><TextLink to={url()} className="back-link"><ArrowLeft size={16}/>문의 목록</TextLink><Badge>{mailStatus(selected)}</Badge></div>
        <div className="mail-content"><h2>{selected.subject}</h2><div className="sender"><span className="mini-icon mail-icon"><MailIcon size={18}/></span><div><strong>{selected.sender} · {selected.company}</strong><span>{selected.email}</span></div></div>
        <p className="muted">수신 {dateTime(selected.receivedAt)} (KST)</p><hr/><div className="message-body">{selected.body}</div></div>
        <div className="detail-actions">{selected.leadId ? <TextLink to={`/leads/${selected.leadId}`} className="button button-primary">리드 보기</TextLink> : selected.excluded ? <Button onClick={() => change(prev => ({ ...prev, mails: prev.mails.map(mail => mail.id === selected.id ? { ...mail, excluded: false } : mail) }), '다시 검토할 수 있어요.')}>검토 대기로 복원</Button> : <>
          <Button tone="quiet" onClick={() => change(prev => ({ ...prev, mails: prev.mails.map(mail => mail.id === selected.id ? { ...mail, excluded: true } : mail) }), '처리 제외로 이동했어요.')}>처리 제외</Button>
          <Button tone="primary" onClick={() => setCreatingLead(true)}><Plus size={16}/>리드 등록</Button>
        </>}</div>
      </section>}
    </div>
    {creatingLead && selected && <LeadForm data={data} change={change} mail={selected} onClose={() => setCreatingLead(false)}/>}
  </>
}
