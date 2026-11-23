import { members, stages, type CRM } from '../domain/crm'
import { createDemoData } from './demo'

const storageKey = 'salesman-crm-demo-v1'

export function loadDemo(): CRM {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const data = JSON.parse(saved) as CRM
      data.members ??= members
      data.stages ??= stages.map(label => ({ id: label, label }))
      if (data.mailbox.status === 'working') data.mailbox.status = 'ready'
      return data
    }
  } catch {
    return createDemoData()
  }
  return createDemoData()
}

export function saveDemo(data: CRM) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
