import type { SupabaseClient } from '@supabase/supabase-js'
import type { Activity, CRM, Lead, LeadStage, Mail, Member, SyncStatus, Task, TaskStatus } from '../domain/crm'

type UserRow = { id: string; display_name: string; role: string; active: boolean }
type LeadRow = {
  id: string; stage_id: string; owner_user_id: string; company_name: string; contact_name: string | null
  contact_email: string | null; title: string; summary: string | null; company_size: string | null
  expected_users: number | null; requested_services: string | null; adoption_purpose: string | null
}
type TaskRow = { id: string; lead_id: string; assignee_user_id: string; title: string; status: keyof typeof STATUS; due_date: string | null }
type EmailRow = { id: string; company_name: string | null; sender_name: string | null; sender_email: string; subject: string; body_text: string | null; received_at: string; lead_id: string | null; is_excluded: boolean }
type ActivityRow = { id: string; lead_id: string; author_user_id: string | null; kind: keyof typeof ACTIVITIES; body: string; occurred_at: string }
type TemplateRow = { id: string; owner_user_id: string; name: string; subject: string; body: string }
type DraftRow = { id: string; owner_user_id: string; lead_id: string; template_id: string | null; from_address: string | null; to_address: string | null; subject: string; body: string; updated_at: string }
type Fields = Record<string, string | number | boolean | null>

const STATUS = { pending: '대기', in_progress: '진행 중', completed: '완료' } as const
const STATUS_CODE: Record<TaskStatus, keyof typeof STATUS> = { 대기: 'pending', '진행 중': 'in_progress', 완료: 'completed' }
const ACTIVITIES = { call: '통화', meeting: '미팅', note: '메모', stage_change: '단계 변경' } as const
const ACTIVITY_CODE = { 통화: 'call', 미팅: 'meeting', 메모: 'note' } as const

type Result<T> = { data: T; error: { message: string } | null }
function checked<T>({ data, error }: Result<T>) {
  if (error) throw new Error(error.message)
  return data
}

export async function loadCRM(client: SupabaseClient, userId: string): Promise<CRM> {
  const [membersResult, stagesResult, leadsResult, tasksResult, mailsResult, activitiesResult,
    templatesResult, draftsResult, settingsResult, connectionResult] = await Promise.all([
    client.from('users').select('id,display_name,role,active').eq('active', true).order('created_at').order('id'),
    client.from('lead_stages').select('id,label').order('sort_order').order('id'),
    client.from('leads').select('*').order('created_at', { ascending: false }).order('id'),
    client.from('tasks').select('*').order('created_at', { ascending: false }).order('id'),
    client.from('inbound_emails').select('*').order('received_at', { ascending: false }).order('id'),
    client.from('lead_activities').select('*').order('occurred_at', { ascending: false }).order('id'),
    client.from('mail_templates').select('*').eq('owner_user_id', userId).order('created_at', { ascending: false }).order('id'),
    client.from('mail_drafts').select('*').eq('owner_user_id', userId).order('updated_at', { ascending: false }).order('id'),
    client.from('user_settings').select('work_email').eq('user_id', userId).maybeSingle(),
    client.from('mail_connections').select('sync_status,last_success_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const members = checked(membersResult as Result<UserRow[]>) ?? []
  const stages = checked(stagesResult as Result<LeadStage[]>) ?? []
  const leads = checked(leadsResult as Result<LeadRow[]>) ?? []
  const tasks = checked(tasksResult as Result<TaskRow[]>) ?? []
  const mails = checked(mailsResult as Result<EmailRow[]>) ?? []
  const activities = checked(activitiesResult as Result<ActivityRow[]>) ?? []
  const templates = checked(templatesResult as Result<TemplateRow[]>) ?? []
  const drafts = checked(draftsResult as Result<DraftRow[]>) ?? []
  const profile = checked(settingsResult)
  const mailbox = checked(connectionResult)
  if (!members.some(member => member.id === userId)) throw new Error('사용할 수 없는 계정입니다.')

  return {
    activeMemberId: userId,
    members: members.map((row, index): Member => ({ id: row.id, name: row.display_name,
      initials: row.display_name.slice(0, 2), role: row.role === 'admin' ? '관리자' : '팀원',
      color: ['blue', 'violet', 'green'][index % 3], active: row.active })),
    stages,
    leads: leads.map(row => ({ id: row.id, stage: row.stage_id, ownerId: row.owner_user_id,
      company: row.company_name, contact: row.contact_name ?? '', email: row.contact_email ?? '', title: row.title,
      summary: row.summary ?? '', customerProfile: { companySize: row.company_size ?? '',
        expectedUsers: row.expected_users ?? undefined, requestedServices: row.requested_services ?? '',
        adoptionPurpose: row.adoption_purpose ?? '' } })),
    tasks: tasks.map((row): Task => ({ id: row.id, leadId: row.lead_id, assigneeId: row.assignee_user_id,
      title: row.title, status: STATUS[row.status], due: row.due_date ?? '' })),
    mails: mails.map((row): Mail => ({ id: row.id, company: row.company_name ?? '', sender: row.sender_name ?? '',
      email: row.sender_email, subject: row.subject, body: row.body_text ?? '', receivedAt: row.received_at,
      leadId: row.lead_id ?? undefined, excluded: row.is_excluded })),
    activities: activities.map((row): Activity => ({ id: row.id, leadId: row.lead_id,
      authorId: row.author_user_id ?? '', type: ACTIVITIES[row.kind], text: row.body, at: row.occurred_at })),
    templates: templates.map(row => ({ id: row.id, ownerId: row.owner_user_id, name: row.name, subject: row.subject, body: row.body })),
    drafts: drafts.map(row => ({ id: row.id, ownerId: row.owner_user_id, leadId: row.lead_id,
      templateId: row.template_id ?? undefined, from: row.from_address ?? '', to: row.to_address ?? '',
      subject: row.subject, body: row.body, updatedAt: row.updated_at })),
    profiles: profile ? { [userId]: profile.work_email ?? '' } : {},
    mailbox: { status: (mailbox?.sync_status as SyncStatus | undefined) ?? 'disconnected',
      lastSuccess: mailbox?.last_success_at ?? null },
  }
}

function leadFields(lead: Lead): Fields {
  return { company_name: lead.company, title: lead.title, contact_name: lead.contact || null,
    contact_email: lead.email || null, summary: lead.summary || null, owner_user_id: lead.ownerId,
    stage_id: lead.stage, company_size: lead.customerProfile?.companySize || null,
    expected_users: lead.customerProfile?.expectedUsers ?? null,
    requested_services: lead.customerProfile?.requestedServices || null,
    adoption_purpose: lead.customerProfile?.adoptionPurpose || null }
}
function taskFields(task: Task): Fields {
  return { lead_id: task.leadId, assignee_user_id: task.assigneeId, title: task.title,
    status: STATUS_CODE[task.status], due_date: task.due || null }
}

export async function persistCRM(client: SupabaseClient, userId: string, after: CRM): Promise<{ id?: string }> {
  const before = await loadCRM(client, userId)
  const writes: (() => Promise<{ id?: string }>)[] = []

  function records<T extends { id: string }>(table: string, original: T[], changed: T[], fields: (record: T) => Fields,
    options: { owner?: boolean; delete?: boolean } = {}) {
    const old = new Map(original.map(record => [record.id, record]))
    const remaining = new Set(changed.map(record => record.id))
    for (const record of changed) {
      const prior = old.get(record.id)
      const payload = fields(record)
      if (!prior) {
        writes.push(async () => checked(await client.from(table).insert({ id: record.id,
          ...(options.owner ? { owner_user_id: userId } : {}), ...payload }).select('id').single())!)
        continue
      }
      const previous = fields(prior)
      const patch = Object.fromEntries(Object.entries(payload).filter(([key, value]) => previous[key] !== value))
      if (!Object.keys(patch).length) continue
      writes.push(async () => {
        let query = client.from(table).update(patch).eq('id', record.id)
        if (options.owner) query = query.eq('owner_user_id', userId)
        return checked(await query.select('id').single())!
      })
    }
    if (options.delete) for (const record of original) {
      if (!remaining.has(record.id)) writes.push(async () => {
        let query = client.from(table).delete().eq('id', record.id)
        if (options.owner) query = query.eq('owner_user_id', userId)
        return checked(await query.select('id').single())!
      })
    }
  }

  const linked = after.mails.find(mail => mail.leadId && !before.mails.find(old => old.id === mail.id)?.leadId)
  if (linked) {
    const lead = after.leads.find(item => item.id === linked.leadId)
    if (!lead) throw new Error('연결할 리드가 없어요.')
    const id = checked(await client.rpc('register_lead_from_email', { p_user_id: userId, p_email_id: linked.id,
      p_title: lead.title, p_company_name: lead.company, p_contact_name: lead.contact || null,
      p_contact_email: lead.email || null, p_summary: lead.summary || null }))
    return { id }
  }

  const oldLeads = new Map(before.leads.map(lead => [lead.id, lead]))
  for (const lead of after.leads) {
    const prior = oldLeads.get(lead.id)
    if (!prior) {
      writes.push(async () => checked(await client.from('leads').insert({ id: lead.id, ...leadFields(lead) }).select('id').single())!)
      continue
    }
    const payload = leadFields(lead)
    const previous = leadFields(prior)
    const patch = Object.fromEntries(Object.entries(payload).filter(([key, value]) => previous[key] !== value))
    if (!Object.keys(patch).length) continue
    writes.push(async () => {
      const saved = checked(await client.from('leads').update(patch).eq('id', lead.id).select('id').single())!
      if (prior.stage !== lead.stage) {
        const from = before.stages.find(stage => stage.id === prior.stage)?.label ?? '이전 단계'
        const to = before.stages.find(stage => stage.id === lead.stage)?.label ?? '다음 단계'
        checked(await client.from('lead_activities').insert({ lead_id: lead.id, author_user_id: userId,
          kind: 'stage_change', body: `${from} → ${to}`, previous_stage_id: prior.stage, next_stage_id: lead.stage }))
      }
      return saved
    })
  }

  records('tasks', before.tasks, after.tasks, taskFields, { delete: true })
  records('inbound_emails', before.mails, after.mails, mail => ({ is_excluded: !!mail.excluded }))
  records('lead_activities', before.activities.filter(item => item.type !== '단계 변경'),
    after.activities.filter(item => item.type !== '단계 변경'),
    activity => ({ lead_id: activity.leadId, author_user_id: userId,
      kind: ACTIVITY_CODE[activity.type as keyof typeof ACTIVITY_CODE], body: activity.text }))
  records('mail_templates', before.templates, after.templates,
    template => ({ name: template.name, subject: template.subject, body: template.body }), { owner: true })
  records('mail_drafts', before.drafts, after.drafts,
    draft => ({ lead_id: draft.leadId, template_id: draft.templateId || null, from_address: draft.from || null,
      to_address: draft.to || null, subject: draft.subject, body: draft.body }), { owner: true })

  if (after.profiles[userId] !== before.profiles[userId]) writes.push(async () => {
    checked(await client.from('user_settings').upsert({ user_id: userId,
      work_email: after.profiles[userId] || null }).select('user_id').single())
    return {}
  })
  if (after.mailbox.status !== before.mailbox.status) writes.push(async () => {
    const connection = checked(await client.from('mail_connections').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle())
    if (!connection) throw new Error('연결된 공용 메일이 없어요.')
    checked(await client.from('mail_connections').update({ sync_status: after.mailbox.status }).eq('id', connection.id).select('id').single())
    return {}
  })

  if (writes.length > 1) throw new Error('한 번에 한 항목만 저장할 수 있어요.')
  return writes.length ? writes[0]() : {}
}
