import type { Company, Contact } from '../../domain/crm'
import { companyFields, contactFields, maxCsvRows, nameKey } from '../../domain/directory'

export const companyColumns = ['기업명', '법인번호', '사업자등록번호', '웹사이트']
export const companyHeaders = [...companyColumns, '비고']
export const contactHeaders = ['기업명', '법인번호', '사업자등록번호', '담당자명', '이메일', '연락처', '직함', '비고']
export const maxCsvBytes = 1024 * 1024

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start'
  function finishField() {
    row.push(field)
    field = ''
    state = 'start'
  }
  function finishRow() {
    finishField()
    rows.push(row)
    row = []
  }
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i]
    if (state === 'quoted') {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') state = 'closed'
      else field += char
    } else if (char === ',') {
      finishField()
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      finishRow()
    } else if (state === 'start' && char === '"') {
      state = 'quoted'
    } else {
      if (state === 'closed' || char === '"') throw new Error(`CSV ${rows.length + 1}행의 따옴표를 확인해 주세요.`)
      field += char
      state = 'plain'
    }
  }
  if (state === 'quoted') throw new Error(`CSV ${rows.length + 1}행의 따옴표를 닫아 주세요.`)
  if (row.length || state !== 'start') finishRow()
  return rows
}

const spreadsheetPrefix = /^(?:\s*[=+\-@]|[\t\r\n]|'|0\d+$)/u

function unescapeCell(value: string) {
  return value.startsWith("'") && spreadsheetPrefix.test(value.slice(1)) ? value.slice(1) : value
}

export function encodeCsv(headers: string[], rows: string[][]) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(value => {
    const text = spreadsheetPrefix.test(value) ? "'" + value : value
    return '"' + text.replace(/"/g, '""') + '"'
  }).join(',')).join('\r\n')
}

function readRows<T>(text: string, headers: string[], required: string[], decode: (read: (name: string) => string) => T) {
  const [columns = [], ...lines] = parseCsv(text)
  const names = columns.map(value => value.trim())
  if (new Set(names).size !== names.length || names.some(name => !headers.includes(name)) || required.some(name => !names.includes(name))) {
    throw new Error(`CSV 열 이름을 확인해 주세요. 필수 열은 ${required.join(', ')}이에요. CSV 양식을 사용할 수 있어요.`)
  }
  const records = lines.flatMap((row, index) => {
    if (row.every(value => !value.trim())) return []
    if (row.length !== names.length) throw new Error(`CSV ${index + 2}행의 열 개수를 확인해 주세요.`)
    try {
      return [decode(name => unescapeCell(row[names.indexOf(name)] ?? ''))]
    } catch (error) {
      throw new Error(`CSV ${index + 2}행 · ${(error as Error).message}`)
    }
  })
  if (!records.length || records.length > maxCsvRows) throw new Error(`CSV는 한 번에 1~${maxCsvRows}행을 등록할 수 있어요.`)
  return records
}

export function importCompanies(text: string): Company[] {
  return readRows(text, companyHeaders, ['기업명'], read => ({
    id: crypto.randomUUID(),
    ...companyFields({ name: read('기업명'), legalNumber: read('법인번호'), businessNumber: read('사업자등록번호'), website: read('웹사이트'), notes: read('비고') }),
  }))
}

export function importContacts(text: string, companies: Company[]): Contact[] {
  return readRows(text, contactHeaders, ['기업명', '담당자명'], read => {
    const legalNumber = read('법인번호').trim().replace(/-/g, '')
    const businessNumber = read('사업자등록번호').trim().replace(/-/g, '')
    const name = nameKey(read('기업명'))
    const matches = companies.filter(company => (!name || nameKey(company.name) === name) &&
      (!legalNumber || company.legalNumber === legalNumber) && (!businessNumber || company.businessNumber === businessNumber))
    if (!name && !legalNumber && !businessNumber) throw new Error('기업명이나 등록번호를 입력해 주세요.')
    if (matches.length !== 1) throw new Error(matches.length ? '같은 이름의 기업이 여러 곳이에요. 법인번호 또는 사업자등록번호를 입력해 주세요.' : '일치하는 기업이 없어요. 기업 정보를 먼저 등록해 주세요.')
    return {
      id: crypto.randomUUID(), companyId: matches[0].id,
      ...contactFields({ name: read('담당자명'), email: read('이메일'), phone: read('연락처'), position: read('직함'), notes: read('비고') }),
    }
  })
}
