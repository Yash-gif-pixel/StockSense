import { format, parseISO } from 'date-fns'

const qtyFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
const moneyFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatQty = (n: number) => qtyFmt.format(n)
/** Currency is not defined by the contract — shown as a plain amount. */
export const formatMoney = (n: number) => moneyFmt.format(n)
/** "YYYY-MM-DD" -> "26 Sep 2026" */
export const formatDate = (d: string) => format(parseISO(d), 'd MMM yyyy')
/** ISO timestamp -> "26 Sep 2026, 10:15" */
export const formatDateTime = (ts: string) => format(parseISO(ts), 'd MMM yyyy, HH:mm')

/** Contract display format for products: "[SKU] Name" */
export const productLabel = (p: { sku: string; name: string }) => `[${p.sku}] ${p.name}`
