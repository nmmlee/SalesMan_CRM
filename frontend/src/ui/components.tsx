import { useId, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronDown, Inbox, Search, X } from 'lucide-react'
import type { Member } from '../domain/crm'

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger'
export function Button({ children, tone = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return <button type="button" className={`button button-${tone} ${className}`} {...props}>{children}</button>
}
export function Avatar({ member, size = '' }: { member: Member; size?: string }) {
  return <span className={`avatar avatar-${member.color} ${size}`} aria-hidden="true">{member.initials}</span>
}
export function Person({ member }: { member: Member }) {
  return <span className="person"><Avatar member={member}/><span>{member.name}</span></span>
}
const tones: Record<string, string> = {
  '신규': 'neutral', '상담': 'info', '제안': 'purple', '계약': 'success', '수주': 'success', '진행 중': 'info',
  '완료': 'warning', '검토 대기': 'info', '리드 연결됨': 'success', '담당자 연결됨': 'success', '기한 초과': 'error', '오늘 마감': 'warning', '로스트': 'error', '로스트 메모': 'warning',
}
export function Badge({ children }: { children: string }) {
  return <span className={`badge badge-${tones[children] ?? 'neutral'}`}>{children}</span>
}
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="action-group heading-actions">{children}</div>}</div>
}
export function SectionTitle({ title, children, count }: { title: string; children?: ReactNode; count?: number }) {
  return <div className="section-title"><h2>{title}{count !== undefined && <span className="section-count">{count}</span>}</h2>{children}</div>
}
export function TextLink({ to, children, className = '', ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  return <a className={`text-link ${className}`} href={`#${to}`} {...props}>{children}</a>
}
export function Empty({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={20} /></span><strong>{title}</strong>{detail && <p>{detail}</p>}{children}</div>
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search-box"><Search size={17} aria-hidden="true" /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />{value && <button type="button" className="icon-button" aria-label="검색어 지우기" onClick={() => onChange('')}><X size={15} /></button>}</div>
}
export function TableToolbar({ search, onSearch, placeholder, count, placement = 'below-heading', children }: {
  search: string; onSearch: (value: string) => void; placeholder: string; count?: number
  placement?: 'below-heading' | 'below-tabs' | 'top'; children?: ReactNode
}) {
  return <div className={`action-group toolbar toolbar-${placement}`}>
    <SearchBox value={search} onChange={onSearch} placeholder={placeholder}/>
    {children}
    {count !== undefined && <span className="result-count">총 {count}건</span>}
  </div>
}

export function FormActions({ onCancel, label = '저장', saving = false, disabled = false, tone = 'primary', centered = false, error }: {
  onCancel: () => void; label?: string; saving?: boolean; disabled?: boolean; tone?: ButtonTone; centered?: boolean; error?: string
}) {
  return <>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className={`form-actions${centered ? ' form-actions-centered' : ''}`}>
      <Button onClick={onCancel} disabled={saving}>취소</Button>
      <Button type="submit" tone={tone} disabled={saving || disabled}>{saving ? '저장 중…' : label}</Button>
    </div>
  </>
}
export function NoteField({ label, placeholder, maxLength, name = 'text', initialValue = '', required = true }: {
  label: string; placeholder: string; maxLength?: number; name?: string; initialValue?: string; required?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(initialValue)
  return <div className="note-field">
    <label htmlFor={id}>{label}</label>
    <div className="note-editor">
      <textarea id={id} name={name} required={required} rows={5} maxLength={maxLength} placeholder={placeholder}
        value={text} onChange={event => setText(event.target.value)} aria-describedby={id + '-length'}/>
      <div id={id + '-length'} className="note-editor-footer">
        {text.length.toLocaleString('ko-KR')}{maxLength && ` / ${maxLength.toLocaleString('ko-KR')}`}자
      </div>
    </div>
  </div>
}
export function Select({ value, onChange, options, label }: {
  value: string
  onChange: (value: string) => void
  options: readonly (string | { value: string; label: string })[]
  label: string
}) {
  return <span className="select-wrap">
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => typeof option === 'string'
        ? <option key={option}>{option}</option>
        : <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <ChevronDown size={14} aria-hidden="true" />
  </span>
}
export function Tabs({ tabs, current, onChange, label }: { tabs: readonly string[]; current: string; onChange: (value: string) => void; label: string }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  return <div className="tabs" role="tablist" aria-label={label} onKeyDown={event => {
    const index = tabs.indexOf(current)
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    event.preventDefault()
    onChange(tabs[next])
    buttons.current[next]?.focus()
  }}>{tabs.map((tab, index) => <button type="button" key={tab} id={`tab-${index}`} aria-controls="active-panel" role="tab" aria-selected={tab === current} tabIndex={tab === current ? 0 : -1} ref={element => { buttons.current[index] = element }} onClick={() => onChange(tab)}>{tab}</button>)}</div>
}
export function TabPanel({ tabs, current, children }: { tabs: readonly string[]; current: string; children: ReactNode }) {
  return <div id="active-panel" role="tabpanel" aria-labelledby={`tab-${tabs.indexOf(current)}`}>{children}</div>
}
export function Modal({ title, onClose, children, side = false, subtitle, closeLabel = '닫기' }: {
  title: string; onClose: () => void; children: ReactNode; side?: boolean; subtitle?: ReactNode; closeLabel?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const headingId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    const root = document.documentElement
    if (side) {
      const gutter = Math.max(0, window.innerWidth - document.body.getBoundingClientRect().width)
      root.style.setProperty('--modal-scrollbar-width', `${gutter}px`)
    }
    element?.showModal()
    if (side) close.current?.focus({ preventScroll: true })
    return () => {
      element?.close()
      if (side) root.style.removeProperty('--modal-scrollbar-width')
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: side })
    }
  }, [side])
  return <dialog ref={dialog} className={side ? 'modal modal-side' : 'modal'}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={side ? event => { if (event.target === event.currentTarget) onClose() } : undefined}
    aria-labelledby={headingId}>
    <div className="modal-heading">
      <div><h2 id={headingId}>{title}</h2>{subtitle}</div>
      <button ref={close} type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}><X size={20}/></button>
    </div>
    {side ? <div className="modal-side-content">{children}</div> : children}
  </dialog>
}
export function Toast({ message }: { message: string }) {
  return <div className="toast-region" role="status">{message && <div className="toast"><Check size={17}/>{message}</div>}</div>
}
