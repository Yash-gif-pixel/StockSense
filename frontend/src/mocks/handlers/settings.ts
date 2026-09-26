import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import type { LocationType } from '@/api/types'
import { db, nextId, toLocation, type LocationRow, type WarehouseRow } from '../db'
import { authed } from '../session'
import { errors, paginate, zodFields } from '../utils'

const shortCode = z.string().trim().min(1, 'Short code is required').max(10, 'Max 10 characters')

const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  short_code: shortCode,
  address: z.string().trim().min(1, 'Address is required'),
})

const locationUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  short_code: shortCode,
})
const locationCreateSchema = locationUpdateSchema.extend({ warehouse_id: z.number().int() })

const warehouseCodeTaken = (code: string, exceptId?: number) =>
  db.warehouses.some((w) => w.id !== exceptId && w.short_code.toLowerCase() === code.toLowerCase())

// Mock assumption: location short codes are unique within their warehouse.
const locationCodeTaken = (warehouseId: number | null, code: string, exceptId?: number) =>
  db.locations.some((l) => l.id !== exceptId && l.warehouse_id === warehouseId && l.short_code.toLowerCase() === code.toLowerCase())

export const settingsHandlers = [
  http.get(
    '/api/warehouses',
    authed(({ request }) => HttpResponse.json(paginate([...db.warehouses], new URL(request.url)))),
  ),

  http.post(
    '/api/warehouses',
    authed(async ({ request }) => {
      const parsed = warehouseSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (warehouseCodeTaken(parsed.data.short_code)) {
        return errors.conflict('Short code is already used by another warehouse', { short_code: 'Already used by another warehouse' })
      }
      const wh: WarehouseRow = { id: nextId(db.warehouses), ...parsed.data }
      db.warehouses.push(wh)
      // Contract: auto-creates internal location "Stock".
      db.locations.push({ id: nextId(db.locations), warehouse_id: wh.id, name: 'Stock', short_code: 'Stock', type: 'internal' })
      return HttpResponse.json(wh, { status: 201 })
    }),
  ),

  http.put<{ id: string }>(
    '/api/warehouses/:id',
    authed(async ({ request, params }) => {
      const wh = db.warehouses.find((w) => w.id === Number(params.id))
      if (!wh) return errors.notFound('Warehouse')
      const parsed = warehouseSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (warehouseCodeTaken(parsed.data.short_code, wh.id)) {
        return errors.conflict('Short code is already used by another warehouse', { short_code: 'Already used by another warehouse' })
      }
      Object.assign(wh, parsed.data)
      return HttpResponse.json(wh)
    }),
  ),

  http.get(
    '/api/locations',
    authed(({ request }) => {
      const url = new URL(request.url)
      const type = (url.searchParams.get('type') ?? 'internal') as LocationType
      const warehouseId = url.searchParams.get('warehouse_id')
      const rows = db.locations.filter((l) => l.type === type && (!warehouseId || l.warehouse_id === Number(warehouseId)))
      return HttpResponse.json(paginate(rows.map(toLocation), url))
    }),
  ),

  http.post(
    '/api/locations',
    authed(async ({ request }) => {
      const parsed = locationCreateSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      const { warehouse_id, name, short_code } = parsed.data
      if (!db.warehouses.some((w) => w.id === warehouse_id)) return errors.validation({ warehouse_id: 'Warehouse not found' })
      if (locationCodeTaken(warehouse_id, short_code)) {
        return errors.conflict('Short code is already used in this warehouse', { short_code: 'Already used in this warehouse' })
      }
      const loc: LocationRow = { id: nextId(db.locations), warehouse_id, name, short_code, type: 'internal' }
      db.locations.push(loc)
      return HttpResponse.json(toLocation(loc), { status: 201 })
    }),
  ),

  http.put<{ id: string }>(
    '/api/locations/:id',
    authed(async ({ request, params }) => {
      const loc = db.locations.find((l) => l.id === Number(params.id))
      if (!loc) return errors.notFound('Location')
      const parsed = locationUpdateSchema.safeParse(await request.json())
      if (!parsed.success) return errors.validation(zodFields(parsed.error))
      if (locationCodeTaken(loc.warehouse_id, parsed.data.short_code, loc.id)) {
        return errors.conflict('Short code is already used in this warehouse', { short_code: 'Already used in this warehouse' })
      }
      Object.assign(loc, parsed.data)
      return HttpResponse.json(toLocation(loc))
    }),
  ),
]
