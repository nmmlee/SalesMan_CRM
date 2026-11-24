export const stages = ['신규', '상담', '제안', '계약', '수주', '로스트'] as const
export const taskStatuses = ['대기', '진행 중', '완료'] as const

export type Stage = string
export type LeadStage = { id: Stage; label: string; won?: boolean; lost?: boolean }
export type Company = { id: string; version?: number; name: string; legalNumber: string; businessNumber: string; website: string; notes?: string }
export type Contact = { id: string; version?: number; companyId: string; name: string; email: string; phone: string; position: string; notes?: string }
export const touchTypes = ['통화', '미팅', '이메일', '메모'] as const
export const lossMemoType = '로스트 메모'
export type TouchType = typeof touchTypes[number]
export type Touch = { id: string; companyId: string; contactId?: string; type: TouchType | typeof lossMemoType; text: string; authorId: string; at: string }
export type TaskStatus = typeof taskStatuses[number]
export type Member = { id: string; name: string; initials: string; role: string; color: string; active?: boolean }
export type CustomerProfile = {
  companySize?: string
  expectedUsers?: number
  requestedServices?: string
  adoptionPurpose?: string
}
export type Lead = {
  id: string
  version?: number
  createdAt?: string
  companyId?: string
  contactId?: string
  company: string
  contact: string
  email: string
  title: string
  summary: string
  stage: Stage
  lossReason?: string
  ownerId: string
  customerProfile?: CustomerProfile
}
export type Task = { id: string; version?: number; leadId: string; title: string; assigneeId: string; due: string; status: TaskStatus }
export type Mail = { id: string; version?: number; company: string; sender: string; email: string; subject: string; body?: string; receivedAt: string; leadId?: string; contactId?: string; excluded?: boolean }
export type Activity = { id: string; leadId: string; type: TouchType | '단계 변경'; text: string; authorId: string; at: string }
export function isContactActivity(activity: Activity) {
  return activity.type !== '메모' && activity.type !== '단계 변경'
}
export type Template = { id: string; version?: number; ownerId: string; name: string; subject: string; body: string }
export type Draft = { id: string; version?: number; ownerId: string; leadId: string; from: string; to: string; subject: string; body: string; updatedAt: string; templateId?: string }
export type SyncStatus = 'disconnected' | 'ready' | 'working' | 'failed' | 'reconnect'
export type CRM = {
  members: Member[]
  stages: LeadStage[]
  activeMemberId: string
  companies: Company[]
  contacts: Contact[]
  touches: Touch[]
  leads: Lead[]
  tasks: Task[]
  mails: Mail[]
  activities: Activity[]
  templates: Template[]
  drafts: Draft[]
  profiles: Record<string, string>
  profileVersion?: number
  mailbox: { status: SyncStatus; lastSuccess: string | null; version?: number; connectionId?: string }
}
export type CRMMutationState = Pick<CRM, 'activeMemberId' | 'leads' | 'tasks' | 'mails' | 'activities' | 'templates' | 'drafts' | 'profiles' | 'profileVersion' | 'mailbox'>

export const members: Member[] = [
  { id: 'minji', name: '김민지', initials: '민지', role: '영업 매니저', color: 'blue' },
  { id: 'hyunwoo', name: '이현우', initials: '현우', role: '영업 담당', color: 'violet' },
  { id: 'seoyeon', name: '박서연', initials: '서연', role: '기술 영업', color: 'green' },
]
export function memberFor(data: CRM, id: string): Member {
  return data.members.find(member => member.id === id) ?? { id, name: id ? '알 수 없는 팀원' : '시스템', initials: '–', role: '', color: 'blue' }
}
export function stageLabel(data: CRM, id: Stage) {
  return data.stages.find(stage => stage.id === id)?.label ?? '단계 미지정'
}
export const lossReasonLimit = 2000
export function lossStageFor(data: CRM, lead: Lead) {
  const stage = data.stages.find(item => item.id === lead.stage)
  return stage && !stage.won && !stage.lost ? data.stages.find(item => item.lost) : undefined
}

const kstDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
const kstTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
export function dateKey(offset = 0) {
  return kstDay.format(Date.now() + offset * 86_400_000)
}
export function dateTime(value: string) {
  const day = kstDay.format(new Date(value)).slice(5).replace('-', '. ')
  return `${day}. ${kstTime.format(new Date(value))}`
}
export function shortDate(value: string) {
  return value ? value.slice(5).replace('-', '. ') + '.' : '기한 없음'
}
export function dueLabel(value: string) {
  if (!value) return '기한 없음'
  if (value < dateKey()) return '기한 초과'
  if (value === dateKey()) return '오늘 마감'
  return shortDate(value)
}
export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => Number(a.status === '완료') - Number(b.status === '완료') || (a.due || '9999').localeCompare(b.due || '9999'))
}
export function mailStatus(mail: Mail) {
  return mail.contactId ? '담당자 연결됨' : mail.leadId ? '리드 연결됨' : mail.excluded ? '처리 제외' : '검토 대기'
}
export function applyTemplate(value: string, lead: Lead, author: Member) {
  const fields: Record<string, string> = { 고객사명: lead.company, 담당자명: lead.contact, 내이름: author.name }
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => fields[key]?.trim() || `[입력 필요: ${key}]`)
}
export function upsert<T extends { id: string }>(rows: T[], item: T) {
  return rows.some(row => row.id === item.id) ? rows.map(row => row.id === item.id ? item : row) : [item, ...rows]
}
