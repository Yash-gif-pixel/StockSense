import type { ReactNode } from 'react'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Page title in the nexus-studio style: a small mono eyebrow over a big, tight heading. */
export function PageHeader({ eyebrow, title, actions, children }: { eyebrow?: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="mb-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="mb-1 font-mono text-xs tracking-widest text-signal-ink uppercase">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
