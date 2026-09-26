import { format } from 'date-fns'
import type { OperationDetail } from '@/api/types'
import { Logo } from '@/components/Logo'
import { formatDate, formatDateTime, formatQty } from '@/lib/format'
import { STATUS_LABEL, type OperationTypeConfig } from './config'

/**
 * Print-only document for window.print() (hidden on screen): reference, contact, dates and lines.
 * The interactive form and the app chrome carry `print:hidden`.
 */
export function OperationPrintView({ config, op }: { config: OperationTypeConfig; op: OperationDetail }) {
  const title = config.type === 'delivery' ? 'Delivery Order' : config.type === 'internal' ? 'Internal Transfer' : 'Goods Receipt'
  const rows: [string, string][] = [
    ...(config.type !== 'internal' ? ([[config.contactLabel, op.contact ?? '—']] as [string, string][]) : []),
    ...(config.type === 'delivery' ? ([['Delivery Address', op.delivery_address ?? '—']] as [string, string][]) : []),
    ['Scheduled Date', formatDate(op.scheduled_date)],
    ['From', op.source_location.full_name],
    ['To', op.dest_location.full_name],
    ['Status', STATUS_LABEL[op.status]],
    ...(op.validated_at ? ([['Validated', formatDateTime(op.validated_at)]] as [string, string][]) : []),
    ['Responsible', op.responsible.login_id],
  ]
  const signer = config.type === 'delivery' ? 'Received by (customer)' : 'Received by (warehouse)'

  return (
    <article className="hidden text-[11pt] leading-snug text-black print:block" aria-hidden="true">
      <header className="mb-6 flex items-start justify-between border-b border-black pb-3">
        <Logo />
        <div className="text-right">
          <p className="text-sm uppercase tracking-wide text-neutral-600">{title}</p>
          <p className="text-2xl font-semibold">{op.reference}</p>
        </div>
      </header>

      <dl className="mb-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral-600">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="w-8 py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">SKU</th>
            <th className="py-1.5 pr-2 font-semibold">Product</th>
            <th className="py-1.5 text-right font-semibold">Quantity</th>
            <th className="w-16 py-1.5 pl-2 font-semibold">Unit</th>
          </tr>
        </thead>
        <tbody>
          {op.lines.map((l, i) => (
            <tr key={l.id} className="border-b border-neutral-300 break-inside-avoid">
              <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-2 font-mono text-[10pt]">{l.product.sku}</td>
              <td className="py-1.5 pr-2">{l.product.name}</td>
              <td className="py-1.5 text-right tabular-nums">{formatQty(l.qty)}</td>
              <td className="py-1.5 pl-2">{l.product.uom}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-16 grid grid-cols-2 gap-12 break-inside-avoid">
        {['Prepared by', signer].map((label) => (
          <div key={label}>
            <div className="h-10 border-b border-black" />
            <p className="mt-1 text-sm text-neutral-600">{label}</p>
          </div>
        ))}
      </footer>
      <p className="mt-8 text-xs text-neutral-500">Printed {format(new Date(), 'd MMM yyyy, HH:mm')} · StockSense</p>
    </article>
  )
}
