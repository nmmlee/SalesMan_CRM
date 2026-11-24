import type { SupabaseClient } from '@supabase/supabase-js'
import type { Activity, CRM, CRMMutationState, Lead, LeadStage, Mail, Member, SyncStatus, Task, TaskStatus, Touch } from '../src/domain/crm.js'
import { lossReasonLimit } from '../src/domain/crm.js'
import { withDirectoryNames } from '../src/domain/directory.js'
import { InvalidDirectoryChange } from './_directory.js'

type UserRow = { id: string; display_name: string; role: string; active: boolean }
type Versioned = { row_version: number }
type LeadRow = Versioned & { id: string; created_at: string; company_id?: string; contact_id?: string | null; stage_id: string; loss_reason?: string | null; owner_user_id: string; company_name: string; contact_name: string | null; contact_email: string | null; title: string; summary: string | null; company_size: string | null; expected_users: number | null; requested_services: string | null; adoption_purpose: string | null }
type TaskRow = Versioned & { id: string; lead_id: string; assignee_user_id: string; title: string; status: keyof typeof STATUS; due_date: string | null }
type EmailRow = Versioned & { id: string; company_name: string | null; sender_name: string | null; sender_email: string; subject: string; body_text?: string | null; received_at: string; lead_id: string | null; contact_id?: string | null; is_excluded: boolean }
type ActivityRow = { id: string; lead_id: string; author_user_id: string | null; kind: keyof typeof ACTIVITIES; body: string; occurred_at: string }
type TemplateRow = Versioned & { id: string; owner_user_id: string; name: string; subject: string; body: string }
type DraftRow = Versioned & { id: string; owner_user_id: string; lead_id: string; template_id: string | null; from_address: string | null; to_address: string | null; subject: string; body: string; updated_at: string }
type SettingsRow = Versioned & { work_email: string | null }
type ConnectionRow = Versioned & { id: string; sync_status: string; last_success_at: string | null }
type CompanyRow = Versioned & { id: string; name: string; legal_number: string; business_number: string; website: string; notes?: string }
type ContactRow = Versioned & { id: string; company_id: string; name: string; email: string; phone: string; position: string; notes?: string }
type TouchRow = { id: string; company_id: string; contact_id: string | null; kind: Touch['type']; body: string; author_user_id: string; occurred_at: string }
type Snapshot = { members: UserRow[]; stages: LeadStage[]; leads: LeadRow[]; tasks: TaskRow[]; mails: EmailRow[]; activities: ActivityRow[]; templates: TemplateRow[]; drafts: DraftRow[]; settings: SettingsRow | null; connection: ConnectionRow | null; companies?: CompanyRow[]; contacts?: ContactRow[]; touches?: TouchRow[] }
type Fields = Record<string, string | number | boolean | null>
export type MutationResult = { id?: string; entity?: 'lead' | 'task' | 'mail' | 'template' | 'draft' | 'profile' | 'mailbox'; recordId?: string; version?: number }

const STATUS = { pending: '대기', in_progress: '진행 중', completed: '완료' } as const
const STATUS_CODE: Record<TaskStatus, keyof typeof STATUS> = { 대기: 'pending', '진행 중': 'in_progress', 완료: 'completed' }
const ACTIVITIES = { call: '통화', meeting: '미팅', email: '이메일', note: '메모', stage_change: '단계 변경' } as const
const ACTIVITY_CODE = { 통화: 'call', 미팅: 'meeting', 이메일: 'email', 메모: 'note' } as const

type Result<T> = { data: T; error: { message: string } | null }
function checked<T>({ data, error }: Result<T>) {
  if (error) throw new Error(error.message)
  return data
}
export class ConcurrencyError extends Error { constructor() { super('concurrent_update') } }
function requireSaved<T>(value: T | null): T {
  if (!value) throw new ConcurrencyError()
  return value
}

export async function loadCRM(client: SupabaseClient, userId: string): Promise<CRM> {
  const args = { p_user_id: userId }
  let response = await client.rpc('crm_lifecycle_snapshot', args)
  if (response.error?.code === 'PGRST202') response = await client.rpc('crm_directory_snapshot', args)
  if (response.error?.code === 'PGRST202') response = await client.rpc('crm_snapshot', args)
  const snapshot = checked(response) as Snapshot
  const members = snapshot.members ?? []
  if (!members.some(member => member.id === userId)) throw new Error('사용할 수 없는 계정입니다.')
  return withDirectoryNames({
    activeMemberId: userId,
    members: members.map((row, index): Member => ({ id: row.id, name: row.display_name, initials: row.display_name.slice(0, 2), role: row.role === 'admin' ? '관리자' : '팀원', color: ['blue', 'violet', 'green'][index % 3], active: row.active })),
    stages: snapshot.stages ?? [],
    companies: (snapshot.companies ?? []).map(row => ({ id: row.id, version: row.row_version, name: row.name, legalNumber: row.legal_number, businessNumber: row.business_number, website: row.website, notes: row.notes })),
    contacts: (snapshot.contacts ?? []).map(row => ({ id: row.id, version: row.row_version, companyId: row.company_id, name: row.name, email: row.email, phone: row.phone, position: row.position, notes: row.notes })),
    touches: (snapshot.touches ?? []).map(row => ({ id: row.id, companyId: row.company_id, contactId: row.contact_id ?? undefined, type: row.kind, text: row.body, authorId: row.author_user_id, at: row.occurred_at })),
    leads: (snapshot.leads ?? []).map(row => ({ id: row.id, version: row.row_version, createdAt: row.created_at, companyId: row.company_id, contactId: row.contact_id ?? undefined, stage: row.stage_id, lossReason: row.loss_reason ?? undefined, ownerId: row.owner_user_id, company: row.company_name, contact: row.contact_name ?? '', email: row.contact_email ?? '', title: row.title, summary: row.summary ?? '', customerProfile: { companySize: row.company_size ?? '', expectedUsers: row.expected_users ?? undefined, requestedServices: row.requested_services ?? '', adoptionPurpose: row.adoption_purpose ?? '' } })),
    tasks: (snapshot.tasks ?? []).map((row): Task => ({ id: row.id, version: row.row_version, leadId: row.lead_id, assigneeId: row.assignee_user_id, title: row.title, status: STATUS[row.status], due: row.due_date ?? '' })),
    mails: (snapshot.mails ?? []).map((row): Mail => ({ id: row.id, version: row.row_version, company: row.company_name ?? '', sender: row.sender_name ?? '', email: row.sender_email, subject: row.subject, body: row.body_text === null ? '' : row.body_text, receivedAt: row.received_at, leadId: row.lead_id ?? undefined, contactId: row.contact_id ?? undefined, excluded: row.is_excluded })),
    activities: (snapshot.activities ?? []).map((row): Activity => ({ id: row.id, leadId: row.lead_id, authorId: row.author_user_id ?? '', type: ACTIVITIES[row.kind], text: row.body, at: row.occurred_at })),
    templates: (snapshot.templates ?? []).map(row => ({ id: row.id, version: row.row_version, ownerId: row.owner_user_id, name: row.name, subject: row.subject, body: row.body })),
    drafts: (snapshot.drafts ?? []).map(row => ({ id: row.id, version: row.row_version, ownerId: row.owner_user_id, leadId: row.lead_id, templateId: row.template_id ?? undefined, from: row.from_address ?? '', to: row.to_address ?? '', subject: row.subject, body: row.body, updatedAt: row.updated_at })),
    profiles: snapshot.settings ? { [userId]: snapshot.settings.work_email ?? '' } : {},
    profileVersion: snapshot.settings?.row_version,
    mailbox: { status: (snapshot.connection?.sync_status as SyncStatus | undefined) ?? 'disconnected', lastSuccess: snapshot.connection?.last_success_at ?? null, version: snapshot.connection?.row_version, connectionId: snapshot.connection?.id },
  })
}

function leadFields(lead: Lead): Fields {
  return { company_name: lead.company, title: lead.title, contact_name: lead.contact || null, contact_email: lead.email || null, summary: lead.summary || null, owner_user_id: lead.ownerId, stage_id: lead.stage, company_size: lead.customerProfile?.companySize || null, expected_users: lead.customerProfile?.expectedUsers ?? null, requested_services: lead.customerProfile?.requestedServices || null, adoption_purpose: lead.customerProfile?.adoptionPurpose || null }
}
function taskFields(task: Task): Fields {
  return { lead_id: task.leadId, assignee_user_id: task.assigneeId, title: task.title, status: STATUS_CODE[task.status], due_date: task.due || null }
}

export async function persistCRM(client: SupabaseClient, userId: string, before: CRMMutationState, after: CRMMutationState): Promise<MutationResult> {
  if (before.activeMemberId !== userId || after.activeMemberId !== userId) throw new Error('invalid_user')
  const writes: (() => Promise<MutationResult>)[] = []

  function records<T extends { id: string; version?: number }>(entity: MutationResult['entity'], table: string, original: T[], changed: T[], fields: (record: T) => Fields, options: { owner?: boolean; delete?: boolean } = {}) {
    const old = new Map(original.map(record => [record.id, record]))
    const remaining = new Set(changed.map(record => record.id))
    for (const record of changed) {
      const prior = old.get(record.id)
      const payload = fields(record)
      if (!prior) {
        writes.push(async () => {
          const saved = checked(await client.from(table).insert({ id: record.id, ...(options.owner ? { owner_user_id: userId } : {}), ...payload }).select('id,row_version').single()) as { id: string; row_version: number }
          return { id: saved.id, entity, recordId: saved.id, version: saved.row_version }
        })
        continue
      }
      const previous = fields(prior)
      const patch = Object.fromEntries(Object.entries(payload).filter(([key, value]) => previous[key] !== value))
      if (!Object.keys(patch).length) continue
      writes.push(async () => {
        let query = client.from(table).update(patch).eq('id', record.id).eq('row_version', prior.version ?? 1)
        if (options.owner) query = query.eq('owner_user_id', userId)
        const saved = requireSaved(checked(await query.select('id,row_version').maybeSingle()) as { id: string; row_version: number } | null)
        return { id: saved.id, entity, recordId: saved.id, version: saved.row_version }
      })
    }
    if (options.delete) for (const record of original) {
      if (!remaining.has(record.id)) writes.push(async () => {
        let query = client.from(table).delete().eq('id', record.id).eq('row_version', record.version ?? 1)
        if (options.owner) query = query.eq('owner_user_id', userId)
        requireSaved(checked(await query.select('id').maybeSingle()) as { id: string } | null)
        return { entity, recordId: record.id }
      })
    }
  }

  const oldLeads = new Map(before.leads.map(lead => [lead.id, lead]))
  for (const lead of after.leads) {
    const prior = oldLeads.get(lead.id)
    if (!prior) {
      writes.push(async () => {
        if (!lead.contactId || !lead.companyId) throw new InvalidDirectoryChange('담당자 정보에서 리드를 등록해 주세요.')
        const contact = checked(await client.from('contacts').select('name,email,companies(name)').eq('id', lead.contactId).eq('company_id', lead.companyId).maybeSingle()) as unknown as { name: string; email: string; companies: { name: string } } | null
        if (!contact) throw new InvalidDirectoryChange('연결할 기업과 담당자를 확인해 주세요.')
        const saved = checked(await client.from('leads').insert({
          id: lead.id, ...leadFields({ ...lead, company: contact.companies.name, contact: contact.name, email: contact.email, ownerId: userId }),
          company_id: lead.companyId, contact_id: lead.contactId,
        }).select('id,row_version').single()) as { id: string; row_version: number }
        return { id: saved.id, entity: 'lead', recordId: saved.id, version: saved.row_version }
      })
      continue
    }
    const payload = leadFields(lead)
    const previous = leadFields(prior)
    if (!Object.entries(payload).some(([key, value]) => previous[key] !== value)) continue
    writes.push(async () => {
      if (lead.stage !== prior.stage && lead.lossReason !== undefined) {
        const reason = typeof lead.lossReason === 'string' ? lead.lossReason.trim() : ''
        if (!reason || reason.length > lossReasonLimit) throw new InvalidDirectoryChange('로스트 사유를 1~2,000자로 입력해 주세요.')
        const { data, error } = await client.rpc('crm_mark_lead_lost', {
          p_user_id: userId, p_id: lead.id, p_expected_version: prior.version ?? 1, p_stage_id: lead.stage, p_reason: reason,
        })
        if (error?.code === 'PGRST202') throw new InvalidDirectoryChange('로스트용 Supabase 마이그레이션을 먼저 적용해 주세요.')
        if (error) throw new Error(error.message)
        return { id: lead.id, entity: 'lead', recordId: lead.id, version: Number(data) }
      }
      const { data, error } = await client.rpc('crm_update_lead', { p_user_id: userId, p_id: lead.id, p_expected_version: prior.version ?? 1, p_stage_id: lead.stage, p_owner_user_id: lead.ownerId, p_company_name: lead.company, p_contact_name: lead.contact || null, p_contact_email: lead.email || null, p_title: lead.title, p_summary: lead.summary || null, p_company_size: lead.customerProfile?.companySize || null, p_expected_users: lead.customerProfile?.expectedUsers ?? null, p_requested_services: lead.customerProfile?.requestedServices || null, p_adoption_purpose: lead.customerProfile?.adoptionPurpose || null })
      if (error?.message.includes('concurrent_update')) throw new ConcurrencyError()
      if (error) throw new Error(error.message)
      return { id: lead.id, entity: 'lead', recordId: lead.id, version: Number(data) }
    })
  }

  records('task', 'tasks', before.tasks, after.tasks, taskFields, { delete: true })
  records('mail', 'inbound_emails', before.mails, after.mails, mail => ({ is_excluded: !!mail.excluded }))
  records(undefined, 'lead_activities', before.activities.filter(item => item.type !== '단계 변경'), after.activities.filter(item => item.type !== '단계 변경'), activity => ({ lead_id: activity.leadId, author_user_id: userId, kind: ACTIVITY_CODE[activity.type as keyof typeof ACTIVITY_CODE], body: activity.text, occurred_at: activity.at }))
  records('template', 'mail_templates', before.templates, after.templates, template => ({ name: template.name, subject: template.subject, body: template.body }), { owner: true })
  records('draft', 'mail_drafts', before.drafts, after.drafts, draft => ({ lead_id: draft.leadId, template_id: draft.templateId || null, from_address: draft.from || null, to_address: draft.to || null, subject: draft.subject, body: draft.body }), { owner: true })

  if (after.profiles[userId] !== before.profiles[userId]) writes.push(async () => {
    if (before.profileVersion == null) {
      const saved = checked(await client.from('user_settings').insert({ user_id: userId, work_email: after.profiles[userId] || null }).select('row_version').single()) as Versioned
      return { entity: 'profile', version: saved.row_version }
    }
    const saved = requireSaved(checked(await client.from('user_settings').update({ work_email: after.profiles[userId] || null }).eq('user_id', userId).eq('row_version', before.profileVersion).select('row_version').maybeSingle()) as Versioned | null)
    return { entity: 'profile', version: saved.row_version }
  })
  if (after.mailbox.status !== before.mailbox.status) writes.push(async () => {
    if (!before.mailbox.connectionId || before.mailbox.version == null) throw new Error('연결된 공용 메일이 없어요.')
    const saved = requireSaved(checked(await client.from('mail_connections').update({ sync_status: after.mailbox.status }).eq('id', before.mailbox.connectionId).eq('row_version', before.mailbox.version).select('id,row_version').maybeSingle()) as { id: string; row_version: number } | null)
    return { entity: 'mailbox', recordId: saved.id, version: saved.row_version }
  })

  if (writes.length > 1) throw new Error('한 번에 한 항목만 저장할 수 있어요.')
  return writes.length ? writes[0]() : {}
}
