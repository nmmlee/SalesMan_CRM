import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, X } from 'lucide-react'
import { navigate, type Change, type SaveDirectory } from '../../app/model'
import { dateTime, lossStageFor, memberFor, stageLabel, type Company, type Contact, type CRM, type Lead } from '../../domain/crm'
import { nameKey, wonLeads } from '../../domain/directory'
import { Badge, Button, Empty, Modal, PageTitle, Person, SectionTitle, TableToolbar, TextLink } from '../../ui/components'
import { LeadForm } from '../leads/LeadForm'
import { LossForm } from '../leads/LossForm'
import { CompanyForm, ContactForm, ContactLossMemoForm, TouchForm } from './DirectoryForms'
import { companyColumns, companyHeaders, contactHeaders, encodeCsv, importCompanies, importContacts, maxCsvBytes } from './csv'

type Page = 'companies' | 'contacts' | 'customers'
const titles: Record<Page, string> = { companies: '기업 정보', contacts: '담당자 정보', customers: '고객사 관리' }
const searchLabels: Record<Page, string> = {
  companies: '기업명 또는 등록번호 검색',
  contacts: '이름, 기업, 이메일 또는 연락처 검색',
  customers: '기업명, 등록번호 또는 담당 사원 검색',
}

function downloadCsv(name: string, headers: string[], rows: string[][]) {
  const href = URL.createObjectURL(new Blob([encodeCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = name + '.csv'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

type SheetRow = { id: string; cells: ReactNode[]; search: string }

export function Directory({ page, data, id, change, save }: { page: Page; data: CRM; id?: string; change: Change; save: SaveDirectory }) {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<'new' | 'edit' | 'contact' | 'touch' | 'lead' | 'lossMemo' | null>(null)
  const [lossLeadId, setLossLeadId] = useState<string>()
  const [csvError, setCsvError] = useState('')
  const [importing, setImporting] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const detail = useRef<HTMLElement>(null)
  const detailHeadingId = useId()
  const contactsPage = page === 'contacts'
  const customersPage = page === 'customers'
  const companies = new Map(data.companies.map(row => [row.id, row]))
  const contact = contactsPage ? data.contacts.find(row => row.id === id) : undefined
  const lossLead = contact && data.leads.find(lead => lead.id === lossLeadId && lead.contactId === contact.id)
  const company = companies.get(contactsPage ? contact?.companyId ?? '' : id ?? '')
  const wonByCompany = new Map<string, Lead[]>()
  if (customersPage) for (const lead of wonLeads(data)) {
    if (!lead.companyId) continue
    const companyLeads = wonByCompany.get(lead.companyId)
    if (companyLeads) companyLeads.push(lead)
    else wonByCompany.set(lead.companyId, [lead])
  }
  const ownersByCompany = new Map([...wonByCompany].map(([companyId, leads]) => [
    companyId, [...new Set(leads.map(lead => lead.ownerId))].map(ownerId => memberFor(data, ownerId)),
  ]))
  const title = titles[page]
  const detailOpen = !!company && (!customersPage || wonByCompany.has(company.id))
  const contactsHere = company ? data.contacts.filter(row => row.companyId === company.id) : []
  const headers = contactsPage ? ['담당자 이름', '기업명', '직함', '이메일', '연락처'] :
    customersPage ? ['기업명', '법인번호', '사업자등록번호', '수주 리드', '담당 사원'] : companyColumns
  const csvHeaders = contactsPage ? contactHeaders : companyHeaders

  const contactRows = data.contacts
  const orderedCompanies = data.companies.filter(row => !customersPage || wonByCompany.has(row.id))
  const rows: SheetRow[] = contactsPage ? contactRows.map(row => {
    const organization = companies.get(row.companyId)
    const cells = [row.name, organization?.name, row.position, row.email, row.phone]
    return { id: row.id, cells, search: cells.join(' ') }
  }) : orderedCompanies.map(row => {
    const facts = [row.name, row.legalNumber, row.businessNumber]
    const leads = wonByCompany.get(row.id)
    const owners = ownersByCompany.get(row.id) ?? []
    const cells: ReactNode[] = [...facts, customersPage ? leads?.length : row.website]
    if (customersPage) cells.push(<div className="action-group">{owners.map(owner => <Person key={owner.id} member={owner}/>)}</div>)
    const searchable = [...facts, row.website, ...owners.map(owner => owner.name), ...(leads?.map(lead => lead.title) ?? [])]
    return { id: row.id, cells, search: searchable.join(' ') }
  })
  const visible = rows.filter(row => nameKey(row.search).includes(nameKey(search)))
  const rowPath = (rowId?: string) => `/${page}${rowId ? '/' + rowId : ''}`

  useEffect(() => {
    if (!customersPage || !id || !detailOpen || !window.matchMedia('(max-width: 1180px)').matches) return
    const frame = requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [id, detailOpen, customersPage])

  function exportSheet() {
    const records = contactsPage ? contactRows.map(row => {
      const organization = companies.get(row.companyId)
      return [organization?.name ?? '', organization?.legalNumber ?? '', organization?.businessNumber ?? '', row.name, row.email, row.phone, row.position, row.notes ?? '']
    }) : orderedCompanies.map(row => [row.name, row.legalNumber, row.businessNumber, row.website, row.notes ?? ''])
    downloadCsv(title, csvHeaders, records)
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!selected) return
    setImporting(true)
    setCsvError('')
    try {
      if (selected.size > maxCsvBytes) throw new Error('CSV 파일 크기는 1MB 이하여야 해요.')
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer())
      } catch {
        throw new Error('파일을 CSV UTF-8 형식으로 저장한 뒤 다시 올려 주세요.')
      }
      const operation = contactsPage ? { kind: 'importContacts' as const, rows: importContacts(text, data.companies) }
        : { kind: 'importCompanies' as const, rows: importCompanies(text) }
      await save(operation, `${operation.rows.length}행을 등록했어요.`)
    } catch (cause) {
      setCsvError((cause as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const closeForm = () => setForm(null)
  const notes = contact ? contact.notes : company?.notes
  const selectedOwners = company ? ownersByCompany.get(company.id) : undefined
  const selectedLeads = company ? (customersPage ? wonByCompany.get(company.id) ?? [] :
    data.leads.filter(lead => contact ? lead.contactId === contact.id : lead.companyId === company.id)) : []
  const detailBody = company && <>
    <dl className="directory-facts">
      {(contact ? [['직함', contact.position], ['이메일', contact.email], ['연락처', contact.phone]] :
        [['법인번호', company.legalNumber], ['사업자등록번호', company.businessNumber], ['웹사이트', company.website]]).map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
      {notes && <div><dt>비고</dt><dd className="directory-note">{notes}</dd></div>}
      {selectedOwners && <div><dt>담당 사원</dt><dd className="action-group">{selectedOwners.map(owner => <Person key={owner.id} member={owner}/>)}</dd></div>}
    </dl>
    <div className="action-group directory-detail-actions">
      {customersPage ? <TextLink className="button button-secondary" to={`/companies/${company.id}`}>기업 정보</TextLink> :
        <Button onClick={() => setForm('edit')}><Pencil size={15}/>수정</Button>}
      <Button onClick={() => setForm('touch')}><Plus size={15}/>접촉 기록</Button>
      {contact && <Button tone="primary" onClick={() => setForm('lead')}><Plus size={15}/>리드 등록</Button>}
      {contact && <Button onClick={() => setForm('lossMemo')}>로스트 메모</Button>}
      {!contact && !customersPage && <Button onClick={() => setForm('contact')}><Plus size={15}/>담당자 추가</Button>}
    </div>
    {!contact && <DirectoryLinks title="담당자" links={contactsHere.map(row => ({ id: row.id, label: row.name, to: `/contacts/${row.id}`, meta: row.position }))}/>}
    <DirectoryLinks title={customersPage ? '수주 리드' : '연결된 리드'} links={selectedLeads.map(lead => ({
        id: lead.id, label: lead.title, to: `/leads/${lead.id}`, meta: <>
          <Badge>{stageLabel(data, lead.stage)}</Badge>
          {customersPage && <span>{memberFor(data, lead.ownerId).name}</span>}
        </>,
        action: contact && lossStageFor(data, lead) && <Button tone="quiet" className="loss-action"
          aria-label={`${lead.title} 로스트 처리`} onClick={() => setLossLeadId(lead.id)}>로스트 처리</Button>,
      }))}/>
    <Timeline data={data} company={company} contact={contact}/>
  </>
  return <>
    <PageTitle title={title}>
      {!customersPage && <>
        <Button onClick={() => downloadCsv(title + ' 양식', csvHeaders, [])}>CSV 양식</Button>
        <Button onClick={() => file.current?.click()} disabled={importing || (contactsPage && !data.companies.length)}><ArrowUpFromLine size={16}/>{importing ? '등록 중…' : 'CSV 업로드'}</Button>
        <Button onClick={exportSheet}><ArrowDownToLine size={16}/>CSV 다운로드</Button>
        <Button tone="primary" onClick={() => setForm('new')} disabled={contactsPage && !data.companies.length}><Plus size={16}/>{contactsPage ? '담당자 등록' : '기업 등록'}</Button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={upload}/>
      </>}
    </PageTitle>
    {csvError && <p className="error-text directory-error" role="alert">{csvError}</p>}
    <div className={`directory-grid ${customersPage && detailOpen ? 'directory-with-detail' : ''}`}>
      <section className="panel directory-list" aria-label={title}>
        <TableToolbar search={search} onSearch={setSearch} placeholder={searchLabels[page]} count={visible.length} placement="top"/>
        <div className="table-scroll"><table className="data-table directory-table">
          <thead><tr>{headers.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(row => <tr key={row.id} className={id === row.id && detailOpen ? 'selected-row' : undefined}
            onClick={event => {
              if ((event.target as HTMLElement).closest('a')) return
              event.currentTarget.querySelector('a')?.focus({ preventScroll: true })
              navigate(rowPath(row.id))
            }}>
            {row.cells.map((cell, index) => <td key={index}>{index === 0 ?
              <TextLink className="row-title" to={rowPath(row.id)}>{cell}</TextLink> : (cell || <span className="muted">—</span>)}</td>)}
          </tr>)}</tbody>
        </table></div>
        {!visible.length && <Empty title={search ? '검색 결과가 없어요' : customersPage ? '수주한 고객사가 없어요' : contactsPage ? '등록된 담당자가 없어요' : '등록된 기업이 없어요'}>
          {contactsPage && !data.companies.length && <TextLink to="/companies">기업 정보 먼저 등록하기</TextLink>}
        </Empty>}
      </section>
      {customersPage && detailOpen && company && <aside ref={detail} className="panel directory-detail" aria-labelledby={detailHeadingId}>
        <div className="directory-detail-heading">
          <h2 id={detailHeadingId}>{company.name}</h2>
          <TextLink to={rowPath()} className="icon-button" aria-label="상세 닫기"><X size={20}/></TextLink>
        </div>
        {detailBody}
      </aside>}
    </div>
    {!customersPage && detailOpen && company && <Modal key={`directory-${id}`} side title={contact?.name ?? company.name} closeLabel="상세 닫기"
      subtitle={contact && <TextLink to={`/companies/${company.id}`}>{company.name}</TextLink>} onClose={() => navigate(rowPath())}>
      {detailBody}
    </Modal>}
    {form === 'new' && page === 'companies' && <CompanyForm save={save} onClose={closeForm}/>}
    {form === 'edit' && company && !contact && <CompanyForm key={company.id} company={company} save={save} onClose={closeForm}/>}
    {((form === 'new' && contactsPage) || form === 'contact' || (form === 'edit' && contact)) &&
      <ContactForm key={contact?.id ?? company?.id ?? 'new'} companies={data.companies} contact={form === 'edit' ? contact : undefined} initialCompanyId={company?.id} save={save} onClose={closeForm}/>}
    {form === 'touch' && company && <TouchForm key={id} companyId={company.id} contactId={contact?.id} save={save} onClose={closeForm}/>}
    {form === 'lead' && contact && <LeadForm key={contact.id} data={data} change={change} contact={contact} onClose={closeForm}/>}
    {form === 'lossMemo' && contact && <ContactLossMemoForm key={contact.id} contact={contact} save={save} onClose={closeForm}/>}
    {lossLead && <LossForm key={`loss-${lossLead.id}`} data={data} lead={lossLead} change={change} onClose={() => setLossLeadId(undefined)}/>}
  </>
}

function DirectoryLinks({ title, links }: { title: string; links: { id: string; label: string; to: string; meta?: ReactNode; action?: ReactNode }[] }) {
  return <section className="directory-detail-section">
    <SectionTitle title={title} count={links.length}/>
    {links.length ? <ul className="directory-links">{links.map(link => <li key={link.id}>
      <TextLink to={link.to}>{link.label}</TextLink>
      {(link.meta || link.action) && <div className="action-group directory-link-actions">
        {link.meta && <span className="action-group muted">{link.meta}</span>}{link.action}
      </div>}
    </li>)}</ul> : <p className="muted directory-section-empty">등록된 항목이 없어요.</p>}
  </section>
}

function Timeline({ data, company, contact }: { data: CRM; company: Company; contact?: Contact }) {
  const contacts = new Map(data.contacts.filter(row => row.companyId === company.id).map(row => [row.id, row]))
  const leads = new Map(data.leads.filter(lead => contact ? lead.contactId === contact.id : lead.companyId === company.id).map(lead => [lead.id, lead]))
  const belongs = (contactId?: string) => contact ? contact.id === contactId : !!contactId && contacts.has(contactId)
  const entries = [
    ...Array.from(leads.values()).flatMap(lead => lead.createdAt ? [{
      id: lead.id, at: lead.createdAt, type: '리드 등록', body: '', meta: '',
      link: { to: `/leads/${lead.id}`, text: lead.title },
    }] : []),
    ...data.touches.filter(touch => touch.companyId === company.id && (!contact || belongs(touch.contactId)))
      .map(touch => ({ id: touch.id, at: touch.at, type: touch.type, body: touch.text,
        meta: [!contact && contacts.get(touch.contactId ?? '')?.name, memberFor(data, touch.authorId).name].filter(Boolean).join(' · ') })),
    ...data.activities.filter(activity => leads.has(activity.leadId))
      .map(activity => ({ id: activity.id, at: activity.at, type: activity.type, body: activity.text,
        meta: memberFor(data, activity.authorId).name, link: { to: `/leads/${activity.leadId}?tab=활동`, text: leads.get(activity.leadId)?.title } })),
    ...data.mails.filter(mail => belongs(mail.contactId) || (!contact && !mail.contactId && !!mail.leadId && leads.has(mail.leadId)))
      .map(mail => ({ id: mail.id, at: mail.receivedAt, type: '메일 수신', body: '', meta: mail.sender || mail.email,
        link: { to: `/inbox/${mail.id}`, text: mail.subject } })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return <section className="directory-detail-section">
    <SectionTitle title="접촉 타임라인" count={entries.length}/>
    {entries.length ? <ol className="directory-timeline">{entries.map(entry => <li key={entry.id}>
      <div className="action-group"><Badge>{entry.type}</Badge><time dateTime={entry.at}>{dateTime(entry.at)}</time></div>
      {entry.body && <p>{entry.body}</p>}
      {'link' in entry && entry.link && <TextLink to={entry.link.to}>{entry.link.text}</TextLink>}
      {entry.meta && <span className="muted">{entry.meta}</span>}
    </li>)}</ol> : <p className="muted directory-section-empty">아직 기록된 접촉이 없어요.</p>}
  </section>
}
