import { CalendarClock, Mail, NotebookPen, Phone, UsersRound } from 'lucide-react'
import { touchTypes } from '../domain/crm'

const typeIcons = { 통화: Phone, 미팅: UsersRound, 이메일: Mail, 메모: NotebookPen }

export function RecordFields({ typeLabel, dateLabel }: { typeLabel: string; dateLabel: string }) {
  const defaultTime = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
  return <>
    <fieldset className="record-types">
      <legend>{typeLabel}</legend>
      <div className="record-type-options">{touchTypes.map((type, index) => {
        const Icon = typeIcons[type]
        return <label key={type}>
          <input name="type" type="radio" value={type} defaultChecked={index === 0}/>
          <span><Icon size={16} aria-hidden="true"/>{type}</span>
        </label>
      })}</div>
    </fieldset>
    <label className="record-date">
      <span><CalendarClock size={16} aria-hidden="true"/>{dateLabel} <small>KST</small></span>
      <input type="datetime-local" name="at" required defaultValue={defaultTime}/>
    </label>
  </>
}

export function recordedAt(value: string) {
  return new Date(value + ':00+09:00').toISOString()
}
