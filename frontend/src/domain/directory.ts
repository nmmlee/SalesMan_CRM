import type { Company, Contact, CRM, Touch } from './crm.js'

export type CompanyFields = Omit<Company, 'id' | 'version'>
export type ContactFields = Omit<Contact, 'id' | 'version' | 'companyId'>
export type DirectoryChange =
  | { kind: 'company'; company: Company }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'importCompanies'; rows: Company[] }
  | { kind: 'importContacts'; rows: Contact[] }
  | { kind: 'touch'; touch: Omit<Touch, 'authorId'> }
  | { kind: 'linkMail'; mailId: string; version?: number; company: Company; contact: Contact }

export const maxCsvRows = 1000
export const directoryNoteLimit = 4000

function cleanNotes(value?: string) {
  const notes = value?.trim()
  if (notes && notes.length > directoryNoteLimit) throw new Error('비고는 4,000자 이내로 입력해 주세요.')
  return notes
}

export function nameKey(value: string) {
  return value.trim().toLowerCase()
}

export function companyFields(fields: CompanyFields): CompanyFields {
  const name = fields.name.trim()
  const legalNumber = fields.legalNumber.trim().replace(/-/g, '')
  const businessNumber = fields.businessNumber.trim().replace(/-/g, '')
  const website = fields.website.trim()
  if (!name || name.length > 200) throw new Error('기업명을 1~200자로 입력해 주세요.')
  if (legalNumber && !/^\d{13}$/.test(legalNumber)) throw new Error('법인번호는 숫자 13자리로 입력해 주세요.')
  if (businessNumber && !/^\d{10}$/.test(businessNumber)) throw new Error('사업자등록번호는 숫자 10자리로 입력해 주세요.')
  if (website.length > 300) throw new Error('웹사이트 주소는 300자 이내로 입력해 주세요.')
  return { name, legalNumber, businessNumber, website, notes: cleanNotes(fields.notes) }
}

export function contactFields(fields: ContactFields): ContactFields {
  const name = fields.name.trim()
  const email = nameKey(fields.email)
  const phone = fields.phone.trim()
  const position = fields.position.trim()
  if (!name || name.length > 200) throw new Error('담당자 이름을 1~200자로 입력해 주세요.')
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error('담당자 이메일 형식을 확인해 주세요.')
  if (phone.length > 60 || position.length > 120) throw new Error('연락처는 60자, 직함은 120자 이내로 입력해 주세요.')
  return { name, email, phone, position, notes: cleanNotes(fields.notes) }
}

export function wonLeads(data: CRM) {
  const wonStages = new Set(data.stages.filter(stage => stage.won).map(stage => stage.id))
  return data.leads.filter(lead => wonStages.has(lead.stage))
}

export function withDirectoryNames(data: CRM): CRM {
  const companies = new Map(data.companies.map(company => [company.id, company]))
  const contacts = new Map(data.contacts.map(contact => [contact.id, contact]))
  return { ...data, leads: data.leads.map(lead => {
    const company = companies.get(lead.companyId ?? '')
    const contact = contacts.get(lead.contactId ?? '')
    return { ...lead, company: company?.name ?? lead.company, contact: contact?.name ?? lead.contact, email: contact?.email ?? lead.email }
  }) }
}
