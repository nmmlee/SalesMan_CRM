import type { SupabaseClient } from '@supabase/supabase-js'
import { companyFields, contactFields, maxCsvRows, type DirectoryChange } from '../src/domain/directory.js'
import { lossMemoType, touchTypes, type Company, type Contact, type TouchType } from '../src/domain/crm.js'

export class InvalidDirectoryChange extends Error {}

function checked<T>({ data, error }: { data: T; error: { code: string; message: string } | null }): T {
  if (error?.code === '23505') throw new InvalidDirectoryChange('이미 같은 식별 정보로 등록된 기업 또는 담당자가 있어요.')
  if (error?.code === '23503' || error?.message === 'invalid_directory_contact') throw new InvalidDirectoryChange('연결할 기업과 담당자를 확인해 주세요.')
  if (error?.code === 'PGRST202' || error?.code === 'PGRST204' || error?.code === 'PGRST205') throw new InvalidDirectoryChange('기업·담당자 관리용 Supabase 마이그레이션을 먼저 적용해 주세요.')
  if (error) throw new Error(error.message)
  return data
}

function companyPayload(company: Company) {
  const fields = companyFields(company)
  return { name: fields.name, legal_number: fields.legalNumber, business_number: fields.businessNumber, website: fields.website, notes: fields.notes }
}

function contactPayload(contact: Contact) {
  return contactFields(contact)
}

function validateFields<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new InvalidDirectoryChange(error instanceof TypeError ? '입력 항목을 확인해 주세요.' : (error as Error).message)
  }
}

export async function persistDirectory(client: SupabaseClient, userId: string, change: DirectoryChange | undefined): Promise<string | undefined> {
  if (change?.kind === 'company' || change?.kind === 'contact') {
    const company = change.kind === 'company' ? change.company : undefined
    const record = change.kind === 'company' ? change.company : change.contact
    const table = client.from(company ? 'companies' : 'contacts')
    const fields = validateFields(() => change.kind === 'company' ? companyPayload(change.company) : contactPayload(change.contact))
    if (record.version == null) {
      checked(await table.insert({ id: record.id, ...fields, ...(change.kind === 'contact' ? { company_id: change.contact.companyId } : {}) }))
    } else {
      const saved = checked(await table.update(fields).eq('id', record.id).eq('row_version', record.version).select('id').maybeSingle())
      if (!saved) throw new Error('concurrent_update')
    }
    return record.id
  }
  if (change?.kind === 'importCompanies' || change?.kind === 'importContacts') {
    if (!Array.isArray(change.rows) || !change.rows.length || change.rows.length > maxCsvRows) {
      throw new InvalidDirectoryChange(`CSV는 한 번에 1~${maxCsvRows}행을 등록할 수 있어요.`)
    }
    if (change.kind === 'importCompanies') {
      const rows = validateFields(() => change.rows.map(row => ({ id: row.id, ...companyPayload(row) })))
      checked(await client.from('companies').insert(rows))
    } else {
      const rows = validateFields(() => change.rows.map(row => ({ id: row.id, company_id: row.companyId, ...contactPayload(row) })))
      checked(await client.from('contacts').insert(rows))
    }
    return
  }
  if (change?.kind === 'touch') {
    const touch = change.touch
    const validType = touch?.type === lossMemoType ? !!touch.contactId : touchTypes.includes(touch?.type as TouchType)
    if (!touch || typeof touch.text !== 'string' || !touch.text.trim() || touch.text.length > 4000 ||
        !validType || !Number.isFinite(Date.parse(touch.at))) {
      throw new InvalidDirectoryChange('활동 유형, 시각 및 기록 내용을 확인해 주세요.')
    }
    checked(await client.from('contact_touches').insert({
      id: touch.id, company_id: touch.companyId, contact_id: touch.contactId ?? null, kind: touch.type,
      body: touch.text.trim(), occurred_at: touch.at, author_user_id: userId,
    }))
    return touch.id
  }
  if (change?.kind === 'linkMail') {
    if (change.version == null || !change.company || !change.contact) throw new InvalidDirectoryChange('메일과 연결 대상을 확인해 주세요.')
    const company = change.company.version == null ? validateFields(() => companyPayload(change.company)) : null
    const contact = change.contact.version == null ? validateFields(() => contactPayload(change.contact)) : null
    return checked(await client.rpc('crm_link_inquiry', {
      p_mail_id: change.mailId, p_version: change.version,
      p_company_id: company ? null : change.company.id, p_contact_id: contact ? null : change.contact.id,
      p_company: company, p_contact: contact,
    })) as string
  }
  throw new InvalidDirectoryChange('지원하지 않는 기업·담당자 요청이에요.')
}
