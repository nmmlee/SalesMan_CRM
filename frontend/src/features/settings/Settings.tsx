import { useState } from 'react'
import { Inbox as InboxIcon, RotateCcw } from 'lucide-react'
import { type CRM, dateTime } from '../../domain/crm'
import { Button, Modal, PageTitle, SectionTitle } from '../../ui/components'
import type { Change } from '../../app/model'

export function Settings({ data, change, syncMailbox }: { data: CRM; change: Change; syncMailbox?: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const { status, lastSuccess } = data.mailbox
  const connected = status !== 'disconnected' && status !== 'reconnect'
  const statusText = { disconnected: '연결 전', ready: '연결됨', failed: '동기화 실패', working: '동기화 중', reconnect: '재연결 필요' }[status]
  return <>
    <PageTitle title="팀 설정" subtitle="팀 공용 메일 연결과 동기화 상태를 확인하세요."/>
    <section className="panel settings-panel"><SectionTitle title="공용 메일 연결"/>
      <div className="info-content stack">
        <div className="lead-company"><span className="mini-icon mail-icon"><InboxIcon size={19}/></span><div><strong>팀 공용 메일</strong><span>{statusText}</span></div></div>
        <dl className="info-pairs"><div><dt>마지막 성공</dt><dd>{lastSuccess ? dateTime(lastSuccess) + ' (KST)' : '동기화 이력 없음'}</dd></div><div><dt>수집 방식</dt><dd>{syncMailbox ? '자동 수집 · 데모 데이터' : '서버 연동'}</dd></div></dl>
        {syncMailbox ? <div className="inline-buttons">{connected ? <>
          <Button tone="primary" disabled={status === 'working'} onClick={syncMailbox}><RotateCcw size={15}/>{status === 'failed' ? '다시 시도' : '지금 동기화'}</Button>
          <Button disabled={status === 'working'} onClick={() => setConfirm(true)}>연결 해제</Button>
        </> : <Button tone="primary" onClick={syncMailbox}>메일 {status === 'reconnect' ? '다시 연결' : '연결'}</Button>}</div>
          : <p className="muted">공용 메일 연결과 동기화는 서버에서 관리해요.</p>}
      </div>
    </section>
    {confirm && <Modal title="공용 메일 연결을 해제할까요?" onClose={() => setConfirm(false)}><div className="form"><p>새 메일 수집이 중단됩니다. 이미 수집한 문의 메일은 계속 볼 수 있어요.</p><div className="form-actions"><Button onClick={() => setConfirm(false)}>취소</Button><Button tone="danger" onClick={() => { change(prev => ({ ...prev, mailbox: { ...prev.mailbox, status: 'disconnected' } }), '공용 메일 연결을 해제했어요.'); setConfirm(false) }}>연결 해제</Button></div></div></Modal>}
  </>
}
