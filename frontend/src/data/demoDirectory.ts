import { upsert, type CRM } from '../domain/crm'
import { nameKey, withDirectoryNames, type DirectoryChange } from '../domain/directory'

function saveRows<T extends { id: string; name: string; version?: number }>(current: T[], rows: T[], keys: (row: T) => string[]) {
  const changes = new Map(rows.map(row => [row.id, row]))
  const allKeys = new Set<string>()
  const next = [
    ...current.filter(row => !changes.has(row.id)),
    ...rows.map(row => ({ ...row, version: (row.version ?? 0) + 1 })),
  ]
  for (const row of next) {
    for (const key of keys(row)) {
      if (allKeys.has(key)) throw new Error('이미 같은 식별 정보로 등록된 기업 또는 담당자가 있어요.')
      allKeys.add(key)
    }
  }
  return next.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

function companyKeys(row: CRM['companies'][number]) {
  if (!row.legalNumber && !row.businessNumber) return [`name:${nameKey(row.name)}`]
  return [row.legalNumber && `legal:${row.legalNumber}`, row.businessNumber && `business:${row.businessNumber}`].filter(Boolean)
}

function contactKeys(row: CRM['contacts'][number]) {
  return [JSON.stringify([row.companyId, row.email ? nameKey(row.email) : null, row.email ? null : nameKey(row.name), row.email ? null : row.phone])]
}

export function migrateDemoDirectory(saved: Omit<CRM, 'companies' | 'contacts' | 'touches'> & Partial<Pick<CRM, 'companies' | 'contacts' | 'touches'>>): CRM {
  const won = { id: '수주', label: '수주', won: true }
  const lost = { id: '로스트', label: '로스트', lost: true }
  const stages = saved.stages.filter(stage => stage.id !== won.id && stage.id !== lost.id)
  const data: CRM = {
    ...saved,
    stages: [...stages, won, lost],
    companies: saved.companies ?? [],
    contacts: saved.contacts ?? [],
    touches: saved.touches ?? [],
  }
  if (saved.companies && saved.contacts && saved.touches) return data
  for (const lead of data.leads) {
    let company = data.companies.find(row => nameKey(row.name) === nameKey(lead.company))
    if (!company) {
      company = { id: crypto.randomUUID(), version: 1, name: lead.company, legalNumber: '', businessNumber: '', website: '' }
      data.companies.push(company)
    }
    lead.companyId = company.id
    const email = nameKey(lead.email)
    const name = lead.contact.trim()
    if (!name && !email) continue
    let contact = data.contacts.find(row => row.companyId === company.id && (email ? row.email === email : !row.email && nameKey(row.name) === nameKey(name)))
    if (!contact) {
      contact = { id: crypto.randomUUID(), version: 1, companyId: company.id, name: name || email, email, phone: '', position: '' }
      data.contacts.push(contact)
    }
    lead.contactId = contact.id
  }
  for (const mail of data.mails) {
    const lead = data.leads.find(row => row.id === mail.leadId)
    if (lead?.email && nameKey(lead.email) === nameKey(mail.email)) mail.contactId = lead.contactId
  }
  return withDirectoryNames(data)
}

export function applyDemoDirectory(data: CRM, change: DirectoryChange): { data: CRM; id?: string } {
  let companies = data.companies
  let contacts = data.contacts
  let mails = data.mails
  let touches = data.touches
  let id: string | undefined
  if (change.kind === 'company' || change.kind === 'importCompanies') {
    const rows = change.kind === 'company' ? [change.company] : change.rows
    companies = saveRows(companies, rows, companyKeys)
    if (change.kind === 'company') id = change.company.id
  }
  if (change.kind === 'contact' || change.kind === 'importContacts') {
    const rows = change.kind === 'contact' ? [change.contact] : change.rows
    contacts = saveRows(contacts, rows, contactKeys)
    if (change.kind === 'contact') id = change.contact.id
  }
  if (change.kind === 'linkMail') {
    const mail = mails.find(row => row.id === change.mailId)
    if (!mail || mail.contactId || mail.excluded) throw new Error('메일 상태가 바뀌었어요. 다시 확인해 주세요.')
    if (change.company.version == null) companies = saveRows(companies, [change.company], companyKeys)
    if (change.contact.version == null) contacts = saveRows(contacts, [change.contact], contactKeys)
    id = change.contact.id
    mails = upsert(mails, { ...mail, contactId: id, version: (mail.version ?? 0) + 1 })
  }
  if (change.kind === 'touch') {
    id = change.touch.id
    touches = upsert(touches, { ...change.touch, authorId: data.activeMemberId })
  }
  return { id, data: withDirectoryNames({ ...data, companies, contacts, mails, touches }) }
}
