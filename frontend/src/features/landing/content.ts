/**
 * Landing copy, in the shape of nexus-studio's src/data/content.js but about StockSense.
 * Every claim here matches the API contract (docs/API_CONTRACT.md) — no invented numbers,
 * clients or testimonials.
 */

export type Feature = { number: string; icon: string; title: string; desc: string; tags: string[]; span: string }

/** Bento grid on md:grid-cols-4 — spans add up to 4 per row. */
export const FEATURES: Feature[] = [
  { number: '01', icon: 'ArrowDownToLine', title: 'Receipts', desc: 'Goods in from vendors. Validate and the stock lands at its destination, with the move logged.', tags: ['Vendors', 'Validate', 'Move logged'], span: 'md:col-span-2' },
  { number: '02', icon: 'ArrowUpFromLine', title: 'Deliveries', desc: 'Goods out to customers. Confirming reserves the stock, so it cannot be promised twice.', tags: ['Reserve', 'Waiting', 'Print'], span: 'md:col-span-1' },
  { number: '03', icon: 'ArrowLeftRight', title: 'Transfers', desc: 'Move stock between your locations on one document, reserved at the source.', tags: ['Source', 'Destination'], span: 'md:col-span-1' },
  { number: '04', icon: 'SlidersHorizontal', title: 'Adjustments', desc: 'Count a shelf and enter what you found. The difference is recorded with a reason.', tags: ['Count', 'Damaged', 'Lost'], span: 'md:col-span-2' },
  { number: '05', icon: 'History', title: 'Move history', desc: 'One line per product per document, filterable by product, location and date.', tags: ['In', 'Out', 'Internal'], span: 'md:col-span-1' },
  { number: '06', icon: 'LayoutDashboard', title: 'Dashboard', desc: 'What is ready, what is late and what is waiting, per warehouse and category.', tags: ['Late', 'Waiting', 'Upcoming'], span: 'md:col-span-1' },
  { number: '07', icon: 'AlertTriangle', title: 'Short lines, flagged', desc: 'A delivery that cannot be filled says so line by line, then waits. When a receipt brings stock in, Check Availability moves it on.', tags: ['Red lines', 'Check availability', 'No overselling'], span: 'md:col-span-3' },
  { number: '08', icon: 'Warehouse', title: 'Warehouses', desc: 'Define warehouses and locations; stock and filters follow them.', tags: ['Multi-warehouse', 'Locations'], span: 'md:col-span-1' },
]

/** The feature ticker that replaces the original's client-logo cloud. */
export const MARQUEE = ['Receipts', 'Deliveries', 'Transfers', 'Adjustments', 'Move history', 'Reservations', 'Late alerts', 'Stock by location', 'Print-ready documents', 'Light & dark']

export const CHAPTERS = [
  {
    num: '01',
    title: 'Spreadsheets forget.',
    p1: 'A cell that says 40 does not say who changed it, when, or why. By the time a count disagrees with the sheet, the trail is already gone.',
    p2: 'Paper registers fare no better: two people, two versions, and a shelf that is actually empty.',
    align: 'left',
  },
  {
    num: '02',
    title: 'A number should come with its history.',
    p1: 'In StockSense, stock never changes because someone typed a number. It changes when a document is validated: a receipt in, a delivery out, a transfer between shelves, an adjustment after a count.',
    p2: 'Each of those becomes a line in Move History, so any quantity can be traced back to the documents that made it.',
    align: 'right',
  },
  {
    num: '03',
    title: 'So the shelf and the books finally agree.',
    p1: 'Deliveries reserve what they promise, short lines turn red before a customer hears about it, and late work surfaces on its own.',
    p2: 'The discipline of a ledger, at the speed of a spreadsheet.',
    align: 'center',
  },
] as const

/** A delivery's life, as the scroll timeline (the original's ProcessTimeline). */
export const FLOW = [
  { chip: 'Draft', title: 'Write it down', tagline: 'Nothing is reserved yet', desc: 'Contact, delivery address, source location and the products. Edit freely until you confirm.' },
  { chip: 'To Do', title: 'Stock is set aside', tagline: 'Confirming reserves it', desc: 'StockSense checks what is free at the source. If every line fits, the stock is reserved and the delivery is Ready.' },
  { chip: 'Waiting', title: 'Short lines turn red', tagline: 'No promise you cannot keep', desc: 'If a line cannot be filled, the delivery waits and shows exactly what is missing and how much is available.' },
  { chip: 'Check availability', title: 'Stock arrives, it moves on', tagline: 'One click re-checks', desc: 'Once a receipt brings stock in, Check Availability reserves it and the delivery becomes Ready.' },
  { chip: 'Done', title: 'Validate', tagline: 'The ledger records it', desc: 'On-hand drops, the reservation clears, and each product gets its line in Move History.' },
  { chip: 'Print', title: 'Paper, if you need it', tagline: 'A clean delivery order', desc: 'Reference, address, date and lines, laid out for signing, straight from the done document.' },
]

/** Facts about how the product works (not usage claims). */
export const STATS = [
  { num: 4, label: 'Document types' },
  { num: 5, label: 'States, draft to done' },
  { num: 100, suffix: '%', label: 'Of stock changes on a document' },
  { num: 0, label: 'Spreadsheets to reconcile' },
]

export const FAQS = [
  { q: 'How do I bring in the stock I already have?', a: 'Create each product with its opening quantity and location, or count a location and record an adjustment. Either way the opening balance is on a document, like everything after it.' },
  { q: 'Can two orders promise the same stock?', a: 'No. Confirming a delivery reserves its stock, so free-to-use drops straight away and the next order sees only what is really left.' },
  { q: 'What happens when a delivery cannot be filled?', a: 'It goes to Waiting instead of Ready, and the short lines turn red with what is available. When a receipt brings stock in, Check Availability moves it on.' },
  { q: 'Can I undo a validated receipt or delivery?', a: 'No. Validated documents are final, because the history depends on it. A mistake is corrected with a new document, such as an adjustment, which is recorded too.' },
  { q: 'Does it work across several warehouses?', a: 'Yes. Each warehouse has its own locations, and stock, dashboards and filters can be scoped to one warehouse at a time.' },
  { q: 'Is there a dark mode?', a: 'Yes. Light, dark, or follow your system — switch any time from the sun and moon button.' },
]
