import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import type { OperationAction, OperationStatus } from '@/api/types'
import {
  db,
  isoNow,
  isPending,
  LOC,
  nextId,
  nextReference,
  operationWarehouseId,
  productById,
  quant,
  today,
  toOperationDetail,
  toOperationSummary,
  type OperationRow,
} from '../db'
import { authed, requestUser } from '../session'
import { errors, paginate, zodFields } from '../utils'

// ---------- schemas (contract: POST/PUT body by type) ----------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const lines = z
  .array(z.object({ product_id: z.number().int(), qty: z.number().positive('Quantity must be greater than 0') }))
  .min(1, 'Add at least one product')

const bodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('receipt'),
    contact: z.string().trim().min(1, 'Contact is required'),
    dest_location_id: z.number().int(),
    scheduled_date: dateString,
    lines,
  }),
  z.object({
    type: z.literal('delivery'),
    contact: z.string().trim().min(1, 'Contact is required'),
    delivery_address: z.string().trim().min(1, 'Delivery address is required'),
    source_location_id: z.number().int(),
    scheduled_date: dateString,
    lines,
  }),
  z.object({
    type: z.literal('internal'),
    source_location_id: z.number().int(),
    dest_location_id: z.number().int(),
    scheduled_date: dateString,
    lines,
  }),
])
type Body = z.infer<typeof bodySchema>

const isInternal = (id: number) => db.locations.some((l) => l.id === id && l.type === 'internal')

/** Backend rules for lines: unknown product → 404; inactive product or a duplicate product line → 422 on that line. */
function checkLines(input: Body['lines']): { notFound?: string; fields?: Record<string, string> } {
  const fields: Record<string, string> = {}
  const seen = new Set<number>()
  for (const [i, l] of input.entries()) {
    const p = productById(l.product_id)
    if (!p) return { notFound: `Product ${l.product_id}` }
    if (!p.active) fields[`lines.${i}.product_id`] = `${p.name} is inactive`
    else if (seen.has(l.product_id)) fields[`lines.${i}.product_id`] = 'Duplicate product line'
    seen.add(l.product_id)
  }
  return Object.keys(fields).length ? { fields } : {}
}

/** Resolves source/dest per type (receipts come from Vendors, deliveries go to Customers). */
function resolveBody(body: Body): { fields: Partial<OperationRow>; error?: Record<string, string> } {
  switch (body.type) {
    case 'receipt':
      if (!isInternal(body.dest_location_id)) return { fields: {}, error: { dest_location_id: 'Choose an internal location' } }
      return {
        fields: { contact: body.contact, source_location_id: LOC.vendors, dest_location_id: body.dest_location_id, delivery_address: null, scheduled_date: body.scheduled_date },
      }
    case 'delivery':
      if (!isInternal(body.source_location_id)) return { fields: {}, error: { source_location_id: 'Choose an internal location' } }
      return {
        fields: {
          contact: body.contact,
          delivery_address: body.delivery_address,
          source_location_id: body.source_location_id,
          dest_location_id: LOC.customers,
          scheduled_date: body.scheduled_date,
        },
      }
    case 'internal':
      if (!isInternal(body.source_location_id)) return { fields: {}, error: { source_location_id: 'Choose an internal location' } }
      if (!isInternal(body.dest_location_id)) return { fields: {}, error: { dest_location_id: 'Choose an internal location' } }
      if (body.source_location_id === body.dest_location_id) return { fields: {}, error: { dest_location_id: 'Must differ from the source' } }
      return {
        fields: { contact: null, delivery_address: null, source_location_id: body.source_location_id, dest_location_id: body.dest_location_id, scheduled_date: body.scheduled_date },
      }
  }
}

function replaceLines(opId: number, input: Body['lines']) {
  db.lines = db.lines.filter((l) => l.operation_id !== opId)
  for (const l of input) db.lines.push({ id: nextId(db.lines), operation_id: opId, product_id: l.product_id, qty: l.qty })
}

// ---------- stock engine ----------

const opLines = (op: OperationRow) => db.lines.filter((l) => l.operation_id === op.id)
const takesFromStock = (op: OperationRow) => op.type === 'delivery' || op.type === 'internal'

/** Every line fits in free-to-use at the source (mock assumption: all-or-nothing). */
function available(op: OperationRow): boolean {
  // Sum per product in case the same product appears on several lines.
  const need = new Map<number, number>()
  for (const l of opLines(op)) need.set(l.product_id, (need.get(l.product_id) ?? 0) + l.qty)
  return [...need].every(([pid, qty]) => {
    const q = quant(pid, op.source_location_id)
    return q.on_hand - q.reserved >= qty
  })
}

function reserve(op: OperationRow, sign: 1 | -1) {
  for (const l of opLines(op)) quant(l.product_id, op.source_location_id).reserved += sign * l.qty
}

function writeMoves(op: OperationRow) {
  const now = isoNow()
  for (const l of opLines(op)) {
    if (takesFromStock(op)) {
      const src = quant(l.product_id, op.source_location_id)
      src.on_hand -= l.qty
      src.reserved -= l.qty
    }
    if (op.type === 'receipt' || op.type === 'internal') quant(l.product_id, op.dest_location_id).on_hand += l.qty
    db.moves.push({
      id: nextId(db.moves),
      created_at: now,
      operation_id: op.id,
      product_id: l.product_id,
      from_location_id: op.source_location_id,
      to_location_id: op.dest_location_id,
      qty: l.qty,
    })
  }
}

const ACTION_FROM: Record<OperationAction, OperationStatus[]> = {
  todo: ['draft'],
  'check-availability': ['waiting'],
  validate: ['ready'],
  cancel: ['draft', 'waiting', 'ready'],
}

function runAction(op: OperationRow, action: OperationAction) {
  switch (action) {
    case 'todo':
      if (!takesFromStock(op)) op.status = 'ready'
      else if (available(op)) {
        reserve(op, 1)
        op.status = 'ready'
      } else op.status = 'waiting'
      break
    case 'check-availability':
      if (available(op)) {
        reserve(op, 1)
        op.status = 'ready'
      }
      break
    case 'validate':
      writeMoves(op)
      op.status = 'done'
      op.validated_at = isoNow()
      break
    case 'cancel':
      if (op.status === 'ready' && takesFromStock(op)) reserve(op, -1)
      op.status = 'canceled'
      break
  }
}

// ---------- handlers ----------

export const operationHandlers = [
  http.get(
    '/api/operations',
    authed(({ request }) => {
      const url = new URL(request.url)
      const p = url.searchParams
      const type = p.get('type')
      const statuses = p.get('status')?.split(',').filter(Boolean)
      const warehouseId = p.get('warehouse_id')
      const categoryId = p.get('category_id')
      const search = p.get('search')?.toLowerCase()
      const late = p.get('late')
      const rows = db.operations
        .filter((op) => {
          if (type && op.type !== type) return false
          if (statuses?.length && !statuses.includes(op.status)) return false
          if (warehouseId && operationWarehouseId(op) !== Number(warehouseId)) return false
          if (categoryId && !opLines(op).some((l) => productById(l.product_id)?.category_id === Number(categoryId))) return false
          if (search && !op.reference.toLowerCase().includes(search) && !(op.contact ?? '').toLowerCase().includes(search)) return false
          const isLate = isPending(op.status) && op.scheduled_date < today()
          if (late === 'true' && !isLate) return false
          if (late === 'false' && isLate) return false
          return true
        })
        // Mock ordering: newest first (contract does not specify list order).
        .sort((a, b) => b.id - a.id)
        .map(toOperationSummary)
      return HttpResponse.json(paginate(rows, url))
    }),
  ),

  http.get<{ id: string }>(
    '/api/operations/:id',
    authed(({ params }) => {
      const op = db.operations.find((o) => o.id === Number(params.id))
      return op ? HttpResponse.json(toOperationDetail(op)) : errors.notFound('Operation')
    }),
  ),

  http.post(
    '/api/operations',
    authed(async ({ request }) => {
      const parsed = bodySchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      const { fields, error } = resolveBody(parsed.data)
      if (error) return errors.validation(error)
      const lineCheck = checkLines(parsed.data.lines)
      if (lineCheck.notFound) return errors.notFound(lineCheck.notFound)
      if (lineCheck.fields) return errors.validation(lineCheck.fields)
      const now = isoNow()
      const internalLoc = parsed.data.type === 'receipt' ? fields.dest_location_id! : fields.source_location_id!
      const op: OperationRow = {
        id: nextId(db.operations),
        reference: nextReference(parsed.data.type, db.locations.find((l) => l.id === internalLoc)!.warehouse_id!),
        type: parsed.data.type,
        status: 'draft',
        contact: null,
        source_location_id: 0,
        dest_location_id: 0,
        scheduled_date: today(),
        delivery_address: null,
        responsible_id: requestUser(request).id,
        created_at: now,
        validated_at: null,
        ...fields,
      }
      db.operations.push(op)
      replaceLines(op.id, parsed.data.lines)
      return HttpResponse.json(toOperationDetail(op), { status: 201 })
    }),
  ),

  http.put<{ id: string }>(
    '/api/operations/:id',
    authed(async ({ request, params }) => {
      const op = db.operations.find((o) => o.id === Number(params.id))
      if (!op) return errors.notFound('Operation')
      if (op.status !== 'draft') return errors.invalidState('Only draft operations can be edited')
      const parsed = bodySchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (parsed.data.type !== op.type) return errors.validation({ type: 'Operation type cannot be changed' })
      const { fields, error } = resolveBody(parsed.data)
      if (error) return errors.validation(error)
      const lineCheck = checkLines(parsed.data.lines)
      if (lineCheck.notFound) return errors.notFound(lineCheck.notFound)
      if (lineCheck.fields) return errors.validation(lineCheck.fields)
      Object.assign(op, fields)
      replaceLines(op.id, parsed.data.lines)
      return HttpResponse.json(toOperationDetail(op))
    }),
  ),

  http.post<{ id: string; action: string }>(
    '/api/operations/:id/:action',
    authed(({ params }) => {
      const action = params.action as OperationAction
      if (!(action in ACTION_FROM)) return errors.notFound('Action')
      const op = db.operations.find((o) => o.id === Number(params.id))
      if (!op) return errors.notFound('Operation')
      if (op.type === 'adjustment') return errors.invalidState('Adjustments are recorded immediately')
      if (!ACTION_FROM[action].includes(op.status)) {
        return errors.invalidState(`Cannot ${action.replace('-', ' ')} an operation that is ${op.status}`)
      }
      runAction(op, action)
      return HttpResponse.json(toOperationDetail(op))
    }),
  ),
]
