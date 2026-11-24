import { useEffect, useState } from 'react'
import { BriefcaseBusiness, Building2, ChevronDown, CircleCheck, ContactRound, Handshake, House, Inbox as InboxIcon, LogOut, Settings as SettingsIcon, UserRound, UsersRound } from 'lucide-react'
import { mailStatus, memberFor, type CRM } from '../domain/crm'
import { Avatar, Button, Empty, Toast } from '../ui/components'
import { Inbox } from '../features/inbox/Inbox'
import { Home } from '../features/home/Home'
import { LeadDetail, Leads } from '../features/leads/Leads'
import { Work } from '../features/work/Work'
import { Profile } from '../features/profile/Profile'
import { Settings } from '../features/settings/Settings'
import { Directory } from '../features/directory/Directory'
import { useDemoCRM, useRemoteCRM, useRoute, type Change, type SaveDirectory } from './model'
import { AuthPanel, Login, PasswordForm, serverMode, signOut, useSession, type SessionUser } from './auth'

const nav = [
  { key: '', name: '홈', icon: House, path: '/' },
  { key: 'inbox', name: '문의함', icon: InboxIcon, path: '/inbox' },
  { key: 'companies', name: '기업 정보', icon: Building2, path: '/companies' },
  { key: 'contacts', name: '담당자 정보', icon: ContactRound, path: '/contacts' },
  { key: 'leads', name: '리드', icon: UsersRound, path: '/leads' },
  { key: 'customers', name: '고객사 관리', icon: Handshake, path: '/customers' },
  { key: 'work', name: '업무', icon: BriefcaseBusiness, path: '/work' },
]

export function App() {
  if (serverMode) return <OnlineApp/>
  return <DemoApp/>
}

function DemoApp() {
  const { data, change, saveDirectory, message, syncMailbox, demoAutoSync } = useDemoCRM()
  useEffect(() => {
    const timer = window.setTimeout(demoAutoSync, 18_000)
    return () => window.clearTimeout(timer)
  }, [])
  return <Workspace data={data} change={change} saveDirectory={saveDirectory} message={message} teamName="영업팀" syncMailbox={syncMailbox}/>
}

function OnlineApp() {
  const { user, reload } = useSession()
  if (user === undefined) return <AuthPanel title="로그인 상태 확인 중"/>
  if (!user) return <Login onAuthenticated={reload}/>
  return <ConnectedWorkspace key={user.id} user={user} onSignedOut={reload}/>
}

function ConnectedWorkspace({ user, onSignedOut }: { user: SessionUser; onSignedOut: () => void }) {
  const [logoutError, setLogoutError] = useState('')
  const { data, change, saveDirectory, message, error, refresh } = useRemoteCRM(user.id)
  const logout = () => signOut().then(onSignedOut).catch(() => setLogoutError('로그아웃하지 못했어요. 다시 시도해 주세요.'))
  if (logoutError) return <AuthPanel title="로그아웃하지 못했어요"><p role="alert">{logoutError}</p>
    <Button onClick={() => setLogoutError('')}>돌아가기</Button></AuthPanel>
  if (error) return <AuthPanel title="팀 데이터를 불러오지 못했어요"><p role="alert">{error}</p><div className="inline-buttons">
    <Button onClick={refresh}>다시 불러오기</Button><Button onClick={logout}>로그아웃</Button>
  </div></AuthPanel>
  if (!data) return <AuthPanel title="팀 데이터를 불러오는 중이에요"/>
  return <Workspace data={data} change={change} saveDirectory={saveDirectory} message={message} teamName="bpocrm" logout={logout} refresh={refresh}
    passwordForm={<PasswordForm/>}/>
}

function Workspace({ data, change, saveDirectory, message, teamName, syncMailbox, logout, refresh, passwordForm }: {
  data: CRM; change: Change; saveDirectory: SaveDirectory; message: string; teamName: string; syncMailbox?: () => void;
  logout?: () => void; refresh?: () => void; passwordForm?: React.ReactNode
}) {
  const { page, id, params } = useRoute()
  const member = memberFor(data, data.activeMemberId)
  const [profileOpen, setProfileOpen] = useState(false)
  const pageName = nav.find(item => item.key === page)?.name ?? (page === 'profile' ? '마이페이지' : '팀 설정')
  const lead = data.leads.find(item => item.id === id)
  const unassignedMailCount = data.mails.filter(mail => mailStatus(mail) === '검토 대기').length

  useEffect(() => {
    document.title = `${pageName} · bpocrm`
  }, [pageName])
  useEffect(() => {
    setProfileOpen(false)
    window.scrollTo(0, 0)
  }, [page])

  return <div className="shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>본문으로 이동</a>
    <aside className="sidebar">
      <a href="#/" className="brand"><span className="brand-mark"><ChartMark/></span><span className="brand-name">bpocrm</span></a>
      <nav className="nav" aria-label="주 메뉴">
        {nav.map(item => {
          const count = item.key === 'inbox' ? unassignedMailCount : 0
          return <a key={item.path} href={`#${item.path}`} aria-current={page === item.key ? 'page' : undefined}
            aria-label={count ? `${item.name} · 검토 대기 ${count}건` : undefined}>
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
      <header className="topbar"><div className="breadcrumb"><span>{teamName}</span><span className="crumb-divider" aria-hidden="true">/</span><strong>{pageName}</strong></div><div className="account" onKeyDown={event => {
        if (event.key === 'Escape') { setProfileOpen(false); document.getElementById('account-toggle')?.focus() }
      }}>
        <button id="account-toggle" type="button" className="account-button" aria-expanded={profileOpen} aria-controls="account-options" onClick={() => setProfileOpen(value => !value)}><Avatar member={member}/><span>{member.name}</span><ChevronDown size={15}/></button>
        {profileOpen && <><button type="button" className="account-dismiss" tabIndex={-1} aria-label="프로필 메뉴 닫기" onClick={() => setProfileOpen(false)}/><div className="account-menu" id="account-options"><a href="#/profile" onClick={() => setProfileOpen(false)}><UserRound size={16}/>마이페이지</a><div className="account-divider"/>
        {logout ? <><button type="button" onClick={() => { setProfileOpen(false); refresh?.() }}>데이터 새로고침</button><button type="button" onClick={logout}><LogOut size={16}/>로그아웃</button></> : <><p>데모 팀원 전환</p>{data.members.map(user => <button type="button" key={user.id} aria-pressed={member.id === user.id} onClick={() => {
          void change(prev => ({ ...prev, activeMemberId: user.id }))
          setProfileOpen(false)
          document.getElementById('account-toggle')?.focus()
        }}><Avatar member={user}/><span>{user.name}</span>{member.id === user.id && <CircleCheck size={15} className="current-member"/>}</button>)}</>}</div></>}
      </div></header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {page === '' && <Home data={data} change={change}/>}
        {page === 'inbox' && <Inbox data={data} change={change} saveDirectory={saveDirectory} id={id} params={params} syncMailbox={syncMailbox} refresh={refresh}/>}
        {(page === 'companies' || page === 'contacts' || page === 'customers') &&
          <Directory key={page} page={page} data={data} id={id} change={change} save={saveDirectory}/>}
        {page === 'leads' && (id ? lead ? <LeadDetail key={lead.id + member.id} data={data} change={change} lead={lead} params={params}/> : <Empty title="리드를 찾을 수 없어요"><a href="#/leads">리드 목록으로 돌아가기</a></Empty> : <Leads data={data} params={params}/>)}
        {page === 'work' && <Work data={data} change={change} due={params.get('due')}/>}
        {page === 'profile' && <Profile key={member.id} data={data} change={change} passwordForm={passwordForm}/>}
        {page === 'settings' && <Settings data={data} change={change} syncMailbox={syncMailbox}/>}
        {!nav.some(item => item.key === page) && page !== 'profile' && page !== 'settings' && <Empty title="페이지를 찾을 수 없어요"><a href="#/">홈으로 돌아가기</a></Empty>}
      </main>
    </div>
    <Toast message={message}/>
  </div>
}

function ChartMark() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M4.5 17.75h15M6.75 14.25v-3.5m5.25 3.5V8m5.25 6.25V5.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
}

