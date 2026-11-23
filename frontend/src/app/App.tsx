import { useEffect, useState } from 'react'
import { BriefcaseBusiness, ChevronDown, CircleCheck, House, Inbox as InboxIcon, Settings as SettingsIcon, UserRound, UsersRound } from 'lucide-react'
import { mailStatus, memberFor, members } from '../domain/crm'
import { Avatar, Empty, Toast } from '../ui/components'
import { Inbox } from '../features/inbox/Inbox'
import { Home } from '../features/home/Home'
import { LeadDetail, Leads } from '../features/leads/Leads'
import { Work } from '../features/work/Work'
import { Profile } from '../features/profile/Profile'
import { Settings } from '../features/settings/Settings'
import { useCRM, useRoute } from './model'

const nav = [
  { key: '', name: '홈', icon: House, path: '/' },
  { key: 'inbox', name: '문의함', icon: InboxIcon, path: '/inbox' },
  { key: 'leads', name: '리드', icon: UsersRound, path: '/leads' },
  { key: 'work', name: '업무', icon: BriefcaseBusiness, path: '/work' },
]

export function App() {
  const { data, change, message, syncMailbox, demoAutoSync } = useCRM()
  const { page, id, params } = useRoute()
  const member = memberFor(data.activeMemberId)
  const [profileOpen, setProfileOpen] = useState(false)
  const pageName = nav.find(item => item.key === page)?.name ?? (page === 'profile' ? '마이페이지' : '팀 설정')
  const lead = data.leads.find(item => item.id === id)
  const unassignedMailCount = data.mails.filter(mail => mailStatus(mail) === '검토 대기').length

  useEffect(() => {
    document.title = `${pageName} · 세일즈맨 CRM`
  }, [pageName])
  useEffect(() => {
    setProfileOpen(false)
    window.scrollTo(0, 0)
  }, [page])
  useEffect(() => {
    const timer = window.setTimeout(demoAutoSync, 18_000)
    return () => window.clearTimeout(timer)
  }, [])

  return <div className="shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>본문으로 이동</a>
    <aside className="sidebar">
      <a href="#/" className="brand"><span className="brand-mark"><ChartMark/></span><span className="brand-name">세일즈맨</span></a>
      <nav className="nav" aria-label="주 메뉴">
        {nav.map(item => {
          const count = item.key === 'inbox' ? unassignedMailCount : 0
          return <a key={item.path} href={`#${item.path}`} aria-current={page === item.key ? 'page' : undefined}
            aria-label={count ? `${item.name} · 리드 미등록 ${count}건` : undefined}>
            <item.icon size={18}/><span className="nav-label">{item.name}</span>
            {count > 0 && <span className="nav-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
          </a>
        })}
      </nav>
      <nav className="sidebar-bottom" aria-label="팀 관리">
        <a href="#/settings" aria-current={page === 'settings' ? 'page' : undefined}><SettingsIcon size={18}/><span>팀 설정</span></a>
      </nav>
    </aside>
    <div className="workspace-main">
      <header className="topbar"><div className="breadcrumb"><span>영업팀</span><span className="crumb-divider" aria-hidden="true">/</span><strong>{pageName}</strong></div><div className="account" onKeyDown={event => {
        if (event.key === 'Escape') { setProfileOpen(false); document.getElementById('account-toggle')?.focus() }
      }}>
        <button id="account-toggle" type="button" className="account-button" aria-expanded={profileOpen} aria-controls="account-options" onClick={() => setProfileOpen(value => !value)}><Avatar id={member.id}/><span>{member.name}</span><ChevronDown size={15}/></button>
        {profileOpen && <><button type="button" className="account-dismiss" tabIndex={-1} aria-label="프로필 메뉴 닫기" onClick={() => setProfileOpen(false)}/><div className="account-menu" id="account-options"><a href="#/profile" onClick={() => setProfileOpen(false)}><UserRound size={16}/>마이페이지</a><div className="account-divider"/><p>데모 팀원 전환</p>{members.map(user => <button type="button" key={user.id} aria-pressed={member.id === user.id} onClick={() => {
          change(prev => ({ ...prev, activeMemberId: user.id }))
          setProfileOpen(false)
          document.getElementById('account-toggle')?.focus()
        }}><Avatar id={user.id}/><span>{user.name}</span>{member.id === user.id && <CircleCheck size={15} className="current-member"/>}</button>)}</div></>}
      </div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {page === '' && <Home data={data} change={change}/>}
        {page === 'inbox' && <Inbox data={data} change={change} id={id} params={params} syncMailbox={() => syncMailbox()}/>}
        {page === 'leads' && (id ? lead ? <LeadDetail key={lead.id + member.id} data={data} change={change} lead={lead} params={params}/> : <Empty title="리드를 찾을 수 없어요"><a href="#/leads">리드 목록으로 돌아가기</a></Empty> : <Leads data={data} change={change} params={params}/>)}
        {page === 'work' && <Work data={data} change={change} due={params.get('due')}/>}
        {page === 'profile' && <Profile key={member.id} data={data} change={change}/>}
        {page === 'settings' && <Settings data={data} change={change} syncMailbox={syncMailbox}/>}
        {!['', 'inbox', 'leads', 'work', 'profile', 'settings'].includes(page) && <Empty title="페이지를 찾을 수 없어요"><a href="#/">홈으로 돌아가기</a></Empty>}
      </main>
    </div>
    <Toast message={message}/>
  </div>
}

function ChartMark() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4.5 17.75h15M6.75 14.25v-3.5m5.25 3.5V8m5.25 6.25V5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
}

