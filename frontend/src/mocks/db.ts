// In-memory mock database. Rows are stored normalized (ids, not nested objects);
// handlers serialize them into contract shapes. State resets on full page reload.
import { addDays, format, subDays } from 'date-fns'
import type { ID, Location, LocationType, OperationDetail, OperationStatus, OperationSummary, OperationType, Product } from '@/api/types'

export interface UserRow {
  id: ID
  login_id: string
  email: string
  password: string
  created_at: string
}
export interface WarehouseRow {
  id: ID
  name: string
  short_code: string
  address: string
}
export interface LocationRow {
  id: ID
  warehouse_id: ID | null
  name: string
  short_code: string
  type: LocationType
}
export interface CategoryRow {
  id: ID
  name: string
}
export interface ProductRow {
  id: ID
  name: string
  sku: string
  category_id: ID | null
  uom: string
  unit_cost: number
  min_qty: number | null
  active: boolean
}
/** Stock of one product at one location. */
export interface QuantRow {
  product_id: ID
  location_id: ID
  on_hand: number
  reserved: number
}
export interface OperationRow {
  id: ID
  reference: string
  type: OperationType
  status: OperationStatus
  contact: string | null
  source_location_id: ID
  dest_location_id: ID
  scheduled_date: string
  delivery_address: string | null
  responsible_id: ID
  created_at: string
  validated_at: string | null
}
export interface LineRow {
  id: ID
  operation_id: ID
  product_id: ID
  qty: number
}
export interface MoveRow {
  id: ID
  created_at: string
  operation_id: ID
  product_id: ID
  from_location_id: ID
  to_location_id: ID
  qty: number
}

export interface Db {
  users: UserRow[]
  warehouses: WarehouseRow[]
  locations: LocationRow[]
  categories: CategoryRow[]
  products: ProductRow[]
  quants: QuantRow[]
  operations: OperationRow[]
  lines: LineRow[]
  moves: MoveRow[]
}

/** Contract: timestamps are UTC ISO 8601 with a trailing Z, e.g. 2026-09-26T04:45:00Z */
export const isoNow = (d: Date = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
const day = (d: Date) => format(d, 'yyyy-MM-dd')

// Well-known seed ids
export const LOC = { stock1: 1, stock2: 2, vendors: 3, customers: 4, adjustment: 5 } as const
export const PROD = { desk: 1, table: 2 } as const

function seed(): Db {
  const today = new Date()
  const created = isoNow(subDays(today, 7))

  return {
    // Demo login for mock mode (test-only credentials).
    users: [{ id: 1, login_id: 'admin01', email: 'admin@stocksense.test', password: 'Admin@1234', created_at: created }],
    warehouses: [{ id: 1, name: 'Main Warehouse', short_code: 'WH', address: '12 Industrial Estate, Pune' }],
    locations: [
      { id: LOC.stock1, warehouse_id: 1, name: 'Stock1', short_code: 'Stock1', type: 'internal' },
      { id: LOC.stock2, warehouse_id: 1, name: 'Stock2', short_code: 'Stock2', type: 'internal' },
      { id: LOC.vendors, warehouse_id: null, name: 'Vendors', short_code: 'VEND', type: 'vendor' },
      { id: LOC.customers, warehouse_id: null, name: 'Customers', short_code: 'CUST', type: 'customer' },
      { id: LOC.adjustment, warehouse_id: null, name: 'Inventory adjustment', short_code: 'ADJ', type: 'adjustment' },
    ],
    categories: [{ id: 1, name: 'Furniture' }],
    products: [
      { id: PROD.desk, name: 'Desk', sku: 'DESK001', category_id: 1, uom: 'Units', unit_cost: 3000, min_qty: 10, active: true },
      { id: PROD.table, name: 'Table', sku: 'TABLE001', category_id: 1, uom: 'Units', unit_cost: 3000, min_qty: 10, active: true },
    ],
    quants: [
      // Desk: 5 reserved by WH/OUT/0001 (ready)
      { product_id: PROD.desk, location_id: LOC.stock1, on_hand: 50, reserved: 5 },
      { product_id: PROD.table, location_id: LOC.stock1, on_hand: 50, reserved: 0 },
    ],
    operations: [
      // Initial stock, recorded as done adjustments
      op(1, 'WH/ADJ/0001', 'adjustment', 'done', null, LOC.adjustment, LOC.stock1, day(subDays(today, 7)), created, created),
      op(2, 'WH/ADJ/0002', 'adjustment', 'done', null, LOC.adjustment, LOC.stock1, day(subDays(today, 7)), created, created),
      // Receipts
      op(3, 'WH/IN/0001', 'receipt', 'ready', 'Azure Interior', LOC.vendors, LOC.stock1, day(subDays(today, 3)), created), // late
      op(4, 'WH/IN/0002', 'receipt', 'draft', 'Wood Corner', LOC.vendors, LOC.stock2, day(addDays(today, 2)), created),
      // Deliveries
      {
        ...op(5, 'WH/OUT/0001', 'delivery', 'ready', 'Deco Addict', LOC.stock1, LOC.customers, day(today), created),
        delivery_address: '44 MG Road, Pune',
      },
      {
        ...op(6, 'WH/OUT/0002', 'delivery', 'waiting', 'Gemini Furniture', LOC.stock1, LOC.customers, day(addDays(today, 1)), created),
        delivery_address: '9 FC Road, Pune',
      },
    ],
    lines: [
      { id: 1, operation_id: 1, product_id: PROD.desk, qty: 50 },
      { id: 2, operation_id: 2, product_id: PROD.table, qty: 50 },
      { id: 3, operation_id: 3, product_id: PROD.desk, qty: 10 },
      { id: 4, operation_id: 4, product_id: PROD.table, qty: 20 },
      { id: 5, operation_id: 5, product_id: PROD.desk, qty: 5 },
      { id: 6, operation_id: 6, product_id: PROD.table, qty: 60 }, // short: only 50 free
      { id: 7, operation_id: 6, product_id: PROD.desk, qty: 3 },
    ],
    moves: [
      { id: 1, created_at: created, operation_id: 1, product_id: PROD.desk, from_location_id: LOC.adjustment, to_location_id: LOC.stock1, qty: 50 },
      { id: 2, created_at: created, operation_id: 2, product_id: PROD.table, from_location_id: LOC.adjustment, to_location_id: LOC.stock1, qty: 50 },
    ],
  }
}

function op(
  id: ID,
  reference: string,
  type: OperationType,
  status: OperationStatus,
  contact: string | null,
  source_location_id: ID,
  dest_location_id: ID,
  scheduled_date: string,
  created_at: string,
  validated_at: string | null = null,
): OperationRow {
  return {
    id,
    reference,
    type,
    status,
    contact,
    source_location_id,
    dest_location_id,
    scheduled_date,
    delivery_address: null,
    responsible_id: 1,
    created_at,
    validated_at,
  }
}

export let db: Db = seed()

export function resetDb() {
  db = seed()
}

export function nextId(rows: { id: ID }[]): ID {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1
}

// ---------- Serializers (row -> contract object) ----------

export function toLocation(row: LocationRow): Location {
  const wh = row.warehouse_id == null ? undefined : db.warehouses.find((w) => w.id === row.warehouse_id)
  return {
    id: row.id,
    warehouse_id: row.warehouse_id,
    name: row.name,
    short_code: row.short_code,
    full_name: wh ? `${wh.short_code}/${row.name}` : row.name,
    type: row.type,
  }
}

export function locationById(id: ID): Location | undefined {
  const row = db.locations.find((l) => l.id === id)
  return row && toLocation(row)
}

export function toProduct(row: ProductRow): Product {
  const cat = row.category_id == null ? null : (db.categories.find((c) => c.id === row.category_id) ?? null)
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: cat ? { id: cat.id, name: cat.name } : null,
    uom: row.uom,
    unit_cost: row.unit_cost,
    min_qty: row.min_qty,
    active: row.active,
  }
}

export function productById(id: ID): ProductRow | undefined {
  return db.products.find((p) => p.id === id)
}

export function quant(productId: ID, locationId: ID): QuantRow {
  let q = db.quants.find((r) => r.product_id === productId && r.location_id === locationId)
  if (!q) {
    q = { product_id: productId, location_id: locationId, on_hand: 0, reserved: 0 }
    db.quants.push(q)
  }
  return q
}

/** Backend APP_TIMEZONE: calendar dates ("today", moves date_from/date_to) are business-local days, not UTC. */
export const BUSINESS_TZ = 'Asia/Kolkata'
const businessDay = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
/** YYYY-MM-DD of an instant in the business timezone. */
export const businessDate = (d: Date | string) => businessDay.format(typeof d === 'string' ? new Date(d) : d)

export const today = () => businessDate(new Date())

const PENDING: OperationStatus[] = ['draft', 'waiting', 'ready']
export const isPending = (s: OperationStatus) => PENDING.includes(s)

/** The internal location that ties an operation to a warehouse. */
export function operationWarehouseId(op: OperationRow): ID | null {
  const internal = [op.dest_location_id, op.source_location_id]
    .map((id) => db.locations.find((l) => l.id === id))
    .find((l) => l?.type === 'internal')
  return internal?.warehouse_id ?? null
}

const REF_PREFIX: Record<OperationType, string> = { receipt: 'IN', delivery: 'OUT', internal: 'INT', adjustment: 'ADJ' }

/** e.g. WH/IN/0003 — numbered per warehouse and type. */
export function nextReference(type: OperationType, warehouseId: ID): string {
  const wh = db.warehouses.find((w) => w.id === warehouseId)
  const prefix = `${wh?.short_code ?? 'WH'}/${REF_PREFIX[type]}/`
  const n = db.operations.filter((o) => o.reference.startsWith(prefix)).length + 1
  return `${prefix}${String(n).padStart(4, '0')}`
}

export function toOperationSummary(op: OperationRow): OperationSummary {
  return {
    id: op.id,
    reference: op.reference,
    type: op.type,
    status: op.status,
    contact: op.contact,
    source_location: locationById(op.source_location_id)!,
    dest_location: locationById(op.dest_location_id)!,
    scheduled_date: op.scheduled_date,
    is_late: isPending(op.status) && op.scheduled_date < today(),
  }
}

export function toOperationDetail(op: OperationRow): OperationDetail {
  const responsible = db.users.find((u) => u.id === op.responsible_id)
  const checksAvailability = (op.type === 'delivery' || op.type === 'internal') && (op.status === 'draft' || op.status === 'waiting')
  return {
    ...toOperationSummary(op),
    delivery_address: op.delivery_address,
    responsible: { id: op.responsible_id, login_id: responsible?.login_id ?? 'unknown' },
    created_at: op.created_at,
    validated_at: op.validated_at,
    lines: db.lines
      .filter((l) => l.operation_id === op.id)
      .map((l) => {
        const q = checksAvailability ? db.quants.find((r) => r.product_id === l.product_id && r.location_id === op.source_location_id) : undefined
        const free = checksAvailability ? (q ? q.on_hand - q.reserved : 0) : null
        return {
          id: l.id,
          product: toProduct(productById(l.product_id)!),
          qty: l.qty,
          free_to_use_at_source: free,
          is_short: free !== null && l.qty > free,
        }
      }),
  }
}
