import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import type { LocationStockRow, StockRow, StockStatus } from '@/api/types'
import {
  db,
  isoNow,
  LOC,
  nextId,
  nextReference,
  productById,
  quant,
  today,
  toLocation,
  toOperationDetail,
  toProduct,
  type OperationRow,
  type ProductRow,
} from '../db'
import { authed, requestUser } from '../session'
import { errors, paginate, zodFields } from '../utils'

// ---------- helpers ----------

const internalLocationIds = (warehouseId?: number) =>
  new Set(db.locations.filter((l) => l.type === 'internal' && (warehouseId === undefined || l.warehouse_id === warehouseId)).map((l) => l.id))

function stockStatus(onHand: number, minQty: number | null): StockStatus {
  if (onHand <= 0) return 'out'
  if (minQty !== null && onHand <= minQty) return 'low'
  return 'ok'
}

export function stockRow(p: ProductRow, warehouseId?: number): StockRow {
  const locIds = internalLocationIds(warehouseId)
  const qs = db.quants.filter((q) => q.product_id === p.id && locIds.has(q.location_id))
  const on_hand = qs.reduce((s, q) => s + q.on_hand, 0)
  const reserved = qs.reduce((s, q) => s + q.reserved, 0)
  return { product: toProduct(p), on_hand, reserved, free_to_use: on_hand - reserved, status: stockStatus(on_hand, p.min_qty) }
}

/** Sets on-hand at an internal location to `counted`, recording a done adjustment + move. Returns the operation. */
function recordAdjustment(productId: number, locationId: number, counted: number, userId: number): OperationRow {
  const q = quant(productId, locationId)
  const diff = counted - q.on_hand
  const loc = db.locations.find((l) => l.id === locationId)!
  const now = isoNow()
  const op: OperationRow = {
    id: nextId(db.operations),
    reference: nextReference('adjustment', loc.warehouse_id!),
    type: 'adjustment',
    status: 'done',
    contact: null,
    source_location_id: diff > 0 ? LOC.adjustment : locationId,
    dest_location_id: diff > 0 ? locationId : LOC.adjustment,
    scheduled_date: today(),
    delivery_address: null,
    responsible_id: userId,
    created_at: now,
    validated_at: now,
  }
  db.operations.push(op)
  db.lines.push({ id: nextId(db.lines), operation_id: op.id, product_id: productId, qty: Math.abs(diff) })
  db.moves.push({
    id: nextId(db.moves),
    created_at: now,
    operation_id: op.id,
    product_id: productId,
    from_location_id: op.source_location_id,
    to_location_id: op.dest_location_id,
    qty: Math.abs(diff),
  })
  q.on_hand = counted
  return op
}

const isInternal = (id: number) => db.locations.some((l) => l.id === id && l.type === 'internal')

// ---------- schemas ----------

const nonNegative = (label: string) => z.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`)

const productBase = {
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().trim().min(1, 'SKU is required'),
  category_id: z.number().int().nullable(),
  uom: z.string().trim().min(1, 'Unit of measure is required'),
  unit_cost: nonNegative('Unit cost'),
  min_qty: nonNegative('Min quantity').nullable(),
}
const productCreateSchema = z.object({
  ...productBase,
  initial_qty: nonNegative('Initial quantity').optional(),
  initial_location_id: z.number().int().optional(),
})
const productUpdateSchema = z.object({ ...productBase, active: z.boolean() })

const adjustSchema = z.object({
  product_id: z.number().int(),
  location_id: z.number().int(),
  counted_qty: nonNegative('Counted quantity'),
  reason: z.enum(['count', 'damaged', 'lost', 'other']),
  note: z.string().optional(),
})

const skuTaken = (sku: string, exceptId?: number) => db.products.some((p) => p.id !== exceptId && p.sku.toLowerCase() === sku.toLowerCase())

// ---------- handlers ----------

export const productHandlers = [
  http.get(
    '/api/categories',
    authed(({ request }) => HttpResponse.json(paginate([...db.categories].sort((a, b) => a.name.localeCompare(b.name)), new URL(request.url)))),
  ),

  http.post(
    '/api/categories',
    authed(async ({ request }) => {
      const parsed = z.object({ name: z.string().trim().min(1, 'Name is required') }).safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (db.categories.some((c) => c.name.toLowerCase() === parsed.data.name.toLowerCase())) {
        return errors.conflict('Category already exists', { name: 'Category already exists' })
      }
      const cat = { id: nextId(db.categories), name: parsed.data.name }
      db.categories.push(cat)
      return HttpResponse.json(cat, { status: 201 })
    }),
  ),

  http.get(
    '/api/products',
    authed(({ request }) => {
      const url = new URL(request.url)
      const search = url.searchParams.get('search')?.toLowerCase()
      const categoryId = url.searchParams.get('category_id')
      const active = url.searchParams.get('active')
      const rows = db.products.filter(
        (p) =>
          (!search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)) &&
          (!categoryId || p.category_id === Number(categoryId)) &&
          (active === null || p.active === (active === 'true')),
      )
      return HttpResponse.json(paginate(rows.map(toProduct), url))
    }),
  ),

  http.post(
    '/api/products',
    authed(async ({ request }) => {
      const parsed = productCreateSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      const { initial_qty, initial_location_id, ...fields } = parsed.data
      if (skuTaken(fields.sku)) return errors.conflict('SKU already exists', { sku: 'SKU already exists' })
      if (fields.category_id !== null && !db.categories.some((c) => c.id === fields.category_id)) {
        return errors.validation({ category_id: 'Category not found' })
      }
      // Mock assumption: a location is required when initial_qty > 0.
      if (initial_qty && initial_qty > 0 && (initial_location_id === undefined || !isInternal(initial_location_id))) {
        return errors.validation({ initial_location_id: 'Choose a location for the initial quantity' })
      }
      const product: ProductRow = { id: nextId(db.products), ...fields, active: true }
      db.products.push(product)
      if (initial_qty && initial_qty > 0 && initial_location_id !== undefined) {
        recordAdjustment(product.id, initial_location_id, initial_qty, requestUser(request).id)
      }
      return HttpResponse.json(toProduct(product), { status: 201 })
    }),
  ),

  http.put<{ id: string }>(
    '/api/products/:id',
    authed(async ({ request, params }) => {
      const product = productById(Number(params.id))
      if (!product) return errors.notFound('Product')
      const parsed = productUpdateSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (skuTaken(parsed.data.sku, product.id)) return errors.conflict('SKU already exists', { sku: 'SKU already exists' })
      Object.assign(product, parsed.data)
      return HttpResponse.json(toProduct(product))
    }),
  ),

  http.get(
    '/api/stock',
    authed(({ request }) => {
      const url = new URL(request.url)
      const search = url.searchParams.get('search')?.toLowerCase()
      const categoryId = url.searchParams.get('category_id')
      const warehouseId = url.searchParams.get('warehouse_id')
      const status = url.searchParams.get('status')
      const rows = db.products
        .filter(
          (p) =>
            (!search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)) &&
            (!categoryId || p.category_id === Number(categoryId)),
        )
        .map((p) => stockRow(p, warehouseId ? Number(warehouseId) : undefined))
        .filter((r) => !status || r.status === status)
      return HttpResponse.json(paginate(rows, url))
    }),
  ),

  http.get<{ productId: string }>(
    '/api/stock/:productId/locations',
    authed(({ request, params }) => {
      const product = productById(Number(params.productId))
      if (!product) return errors.notFound('Product')
      const locIds = internalLocationIds()
      const rows: LocationStockRow[] = db.quants
        .filter((q) => q.product_id === product.id && locIds.has(q.location_id) && (q.on_hand !== 0 || q.reserved !== 0))
        .map((q) => ({
          location: toLocation(db.locations.find((l) => l.id === q.location_id)!),
          on_hand: q.on_hand,
          reserved: q.reserved,
          free_to_use: q.on_hand - q.reserved,
        }))
      return HttpResponse.json(paginate(rows, new URL(request.url)))
    }),
  ),

  http.post(
    '/api/stock/adjust',
    authed(async ({ request }) => {
      const parsed = adjustSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      const { product_id, location_id, counted_qty } = parsed.data
      if (!productById(product_id)) return errors.validation({ product_id: 'Product not found' })
      if (!isInternal(location_id)) return errors.validation({ location_id: 'Choose an internal location' })
      const q = quant(product_id, location_id)
      if (counted_qty < q.reserved) {
        return errors.conflict(`Counted quantity cannot be below the reserved quantity (${q.reserved})`, {
          counted_qty: `Cannot be below reserved (${q.reserved})`,
        })
      }
      if (counted_qty === q.on_hand) return HttpResponse.json({ changed: false, operation: null })
      const op = recordAdjustment(product_id, location_id, counted_qty, requestUser(request).id)
      return HttpResponse.json({ changed: true, operation: toOperationDetail(op) })
    }),
  ),
]
