import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

type PickerOption = { value: string; label: string; tone?: 'neutral' | 'info' | 'warning' }
type Option = string | PickerOption

export function FilterSelect({ label, menuTitle = label, value, options, onChange, compact = false }: {
  label: string
  menuTitle?: string
  value: string
  options: readonly Option[]
  onChange: (value: string) => void
  compact?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const items = options.map<PickerOption>(option => typeof option === 'string' ? { value: option, label: option } : option)
  const selected = items.findIndex(item => item.value === value)
  const current = items[selected] ?? items[0]
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const open = activeIndex !== null

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setActiveIndex(null)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  useLayoutEffect(() => {
    const panel = popup.current
    const button = trigger.current
    if (!open || !panel || !button) return
    const position = () => {
      const anchor = button.getBoundingClientRect()
      const gap = 6
      const margin = 8
      const below = Math.max(0, window.innerHeight - anchor.bottom - gap - margin)
      const above = Math.max(0, anchor.top - gap - margin)
      const preferredHeight = Math.min(280, panel.scrollHeight + 2)
      const placeAbove = below < preferredHeight && above > below
      const height = Math.min(preferredHeight, placeAbove ? above : below)
      panel.style.maxHeight = `${height}px`
      panel.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - panel.offsetWidth - margin))}px`
      panel.style.top = `${placeAbove ? anchor.top - gap - panel.offsetHeight : anchor.bottom + gap}px`
    }
    panel.showPopover?.()
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      if (panel.hidePopover && panel.matches(':popover-open')) panel.hidePopover()
    }
  }, [open])

  useEffect(() => {
    if (activeIndex !== null) document.getElementById(`${id}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, activeIndex])

  function select(index: number) {
    const option = items[index]
    if (option && option.value !== value) onChange(option.value)
    setActiveIndex(null)
  }

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>) {
    const key = event.key
    if (key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setActiveIndex(null)
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      if (activeIndex === null) setActiveIndex(Math.max(0, selected))
      else select(activeIndex)
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault()
      if (activeIndex === null) {
        setActiveIndex(key === 'Home' ? 0 : key === 'End' ? items.length - 1 : Math.max(0, selected))
        return
      }
      const index = key === 'Home' ? 0 : key === 'End' ? items.length - 1
        : Math.max(0, Math.min(items.length - 1, activeIndex + (key === 'ArrowDown' ? 1 : -1)))
      setActiveIndex(index)
    }
  }

  return <div className="filter-picker" ref={root}>
    <button type="button" className={`button button-secondary filter-trigger${compact ? ' filter-trigger-compact' : ''}`} ref={trigger}
      role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`}
      aria-activedescendant={open ? `${id}-${activeIndex}` : undefined}
      aria-label={`${label}: ${current?.label}`}
      data-filter-active={selected > 0} data-tone={current?.tone} onKeyDown={handleKeys} onBlur={() => setActiveIndex(null)}
      onClick={() => setActiveIndex(open ? null : Math.max(0, selected))}>
      <span>{current?.label}</span><ChevronDown size={compact ? 12 : 14} aria-hidden="true"/>
    </button>
    <div className="filter-popover" ref={popup} popover="manual" hidden={!open}>
      <div className="filter-popover-label" aria-hidden="true">{menuTitle}</div>
      <ul id={`${id}-list`} role="listbox" aria-label={label}>
        {items.map((item, index) => <li key={item.value} id={`${id}-${index}`} role="option"
          aria-selected={index === selected} data-highlighted={index === activeIndex}
          onMouseDown={event => event.preventDefault()} onClick={() => select(index)}>
          <span className="filter-option-text">
            {item.tone && <span className="filter-option-dot" data-tone={item.tone} aria-hidden="true"/>}{item.label}
          </span>
          {index === selected && <Check size={15} aria-hidden="true"/>}
        </li>)}
      </ul>
    </div>
  </div>
}
