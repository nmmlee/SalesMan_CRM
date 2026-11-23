import { dateKey, dateTime, mailStatus, sortTasks, type CRM, type Mail } from '../../domain/crm'
import type { Change } from '../../app/model'
import { Empty, PageTitle, SectionTitle, TextLink } from '../../ui/components'
import { Templates } from '../templates/Templates'
import { TaskTable } from '../work/Work'

const reviewQuery = new URLSearchParams({ status: '검토 대기' }).toString()
const reviewQueue = `/inbox?${reviewQuery}`
const homeDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' })

export function Home({ data, change }: { data: CRM; change: Change }) {
  const tasks = sortTasks(data.tasks.filter(task => task.assigneeId === data.activeMemberId && task.status !== '완료'))
  const reviewMails = data.mails
    .filter(mail => mailStatus(mail) === '검토 대기')
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  const today = dateKey()
  const overdue = tasks.filter(task => task.due && task.due < today).length
  const dueToday = tasks.filter(task => task.due === today).length

  return <div className="home">
    <PageTitle title="오늘의 영업 업무">
      <time className="home-date" dateTime={today}>{homeDate.format(new Date())}</time>
    </PageTitle>

    <div className="home-summary" aria-label="업무 요약" role="group">
      <TextLink to="/work?due=기한 초과" className={overdue ? 'summary-overdue' : ''}>
        기한 초과 <strong>{overdue}건</strong>
      </TextLink>
      <TextLink to="/work?due=오늘 마감">오늘 마감 <strong>{dueToday}건</strong></TextLink>
      <TextLink to={reviewQueue}>검토 대기 문의 <strong>{reviewMails.length}건</strong></TextLink>
    </div>

    <div className="dashboard-grid home-grid">
      <section className="home-section home-work" aria-label="내 후속 업무">
        <SectionTitle title="내 후속 업무" count={tasks.length}>
          <TextLink className="home-section-link" to="/work">내 업무 전체 보기</TextLink>
        </SectionTitle>
        {tasks.length
          ? <TaskTable data={data} tasks={tasks.slice(0, 6)} change={change} compact/>
          : <Empty title="배정된 미완료 업무가 없어요"/>}
      </section>
      <div className="home-secondary">
        <section className="home-section" aria-label="우선 확인할 문의">
          <SectionTitle title="우선 확인할 문의">
            <TextLink className="home-section-link" to={reviewQueue}>전체 보기</TextLink>
          </SectionTitle>
          {reviewMails.length ? <InquiryQueue mails={reviewMails.slice(0, 3)}/> : <Empty title="검토 대기 중인 문의가 없어요"/>}
        </section>
        <Templates key={data.activeMemberId} data={data} change={change}/>
      </div>
    </div>
  </div>
}

function InquiryQueue({ mails }: { mails: Mail[] }) {
  return <ul className="home-inquiries" role="list">{mails.map(mail => <li key={mail.id}>
    <a className="mini-row" href={`#/inbox/${mail.id}?${reviewQuery}`}>
      <span className="mini-text">
        <strong>{mail.subject}</strong>
        <span>{mail.company || mail.sender || mail.email}</span>
      </span>
      <time className="numeric" dateTime={mail.receivedAt}>{dateTime(mail.receivedAt)}</time>
    </a>
  </li>)}</ul>
}
