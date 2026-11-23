import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronDown, Inbox, Search, X } from 'lucide-react'
import type { Member } from '../domain/crm'

export function Button({ children, tone = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button type="button" className={`button button-${tone} ${className}`} {...props}>{children}</button>
}
export function Avatar({ member, size = '' }: { member: Member; size?: string }) {
  return <span className={`avatar avatar-${member.color} ${size}`} aria-hidden="true">{member.initials}</span>
}
const tones: Record<string, string> = {
  '신규': 'neutral', '상담': 'info', '제안': 'purple', '계약': 'success', '진행 중': 'info',
  '완료': 'warning', '검토 대기': 'info', '리드 연결됨': 'success', '기한 초과': 'error', '오늘 마감': 'warning',
}
export function Badge({ children }: { children: string }) {
  return <span className={`badge badge-${tones[children] ?? 'neutral'}`}>{children}</span>
}
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children && <div className="heading-actions">{children}</div>}</div>
}
export function SectionTitle({ title, children, count }: { title: string; children?: ReactNode; count?: number }) {
  return <div className="section-title"><h2>{title}{count !== undefined && <span className="section-count">{count}</span>}</h2>{children}</div>
}
export function TextLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return <a className={`text-link ${className}`} href={`#${to}`}>{children}</a>
}
export function Empty({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={20} /></span><strong>{title}</strong>{detail && <p>{detail}</p>}{children}</div>
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search-box"><Search size={17} aria-hidden="true" /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />{value && <button type="button" className="icon-button" aria-label="검색어 지우기" onClick={() => onChange('')}><X size={15} /></button>}</div>
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
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [])
  return <dialog ref={dialog} className="modal" onCancel={event => { event.preventDefault(); onClose() }} aria-labelledby="modal-title">
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>
}
export function Toast({ message }: { message: string }) {
  return <div className="toast-region" role="status">{message && <div className="toast"><Check size={17}/>{message}</div>}</div>
}
