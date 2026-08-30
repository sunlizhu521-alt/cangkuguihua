import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div><div className="header-actions">{actions}</div></header>
}

export function StatusTag({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; children: React.ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' ? AlertCircle : tone === 'info' ? Info : null
  return <span className={`status-tag ${tone}`}>{Icon ? <Icon size={14} /> : null}{children}</span>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><FileEmptyIcon /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}

function FileEmptyIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h14l8 8v28H14z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M28 6v9h8M19 24h12M19 30h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}

export function Money({ value }: { value: number }) {
  return <>{new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(value)}</>
}
