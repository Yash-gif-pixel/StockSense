import { http, HttpResponse } from 'msw'
import type { Move, MoveDirection } from '@/api/types'
import { businessDate, db, locationById, productById, type MoveRow } from '../db'
import { authed } from '../session'
import { paginate } from '../utils'

const isInternal = (id: number) => db.locations.find((l) => l.id === id)?.type === 'internal'

/** in = into an internal location from outside, out = the reverse, internal = between internal locations. */
function direction(m: MoveRow): MoveDirection {
  const from = isInternal(m.from_location_id)
  const to = isInternal(m.to_location_id)
  if (from && to) return 'internal'
  return to ? 'in' : 'out'
}

function toMove(m: MoveRow): Move {
  const op = db.operations.find((o) => o.id === m.operation_id)!
  const p = productById(m.product_id)!
  return {
    id: m.id,
    created_at: m.created_at,
    reference: op.reference,
    operation_id: op.id,
    contact: op.contact,
    product: { id: p.id, name: p.name, sku: p.sku },
    from_location: locationById(m.from_location_id)!,
    to_location: locationById(m.to_location_id)!,
    qty: m.qty,
    direction: direction(m),
  }
}

export const moveHandlers = [
  http.get(
    '/api/moves',
    authed(({ request }) => {
      const url = new URL(request.url)
      const p = url.searchParams
      // Mock assumption: search matches reference, contact, product name or SKU.
      const search = p.get('search')?.toLowerCase()
      const productId = p.get('product_id')
      const locationId = p.get('location_id')
      const dir = p.get('direction')
      const from = p.get('date_from')
      const to = p.get('date_to')
      const rows = db.moves
        .map(toMove)
        .filter((m) => {
          if (productId && m.product.id !== Number(productId)) return false
          if (locationId && m.from_location.id !== Number(locationId) && m.to_location.id !== Number(locationId)) return false
          if (dir && m.direction !== dir) return false
          // Contract: inclusive whole days in the business timezone (Asia/Kolkata), not the UTC date.
          const day = businessDate(m.created_at)
          if (from && day < from) return false
          if (to && day > to) return false
          if (search) {
            const hay = [m.reference, m.contact ?? '', m.product.name, m.product.sku].join(' ').toLowerCase()
            if (!hay.includes(search)) return false
          }
          return true
        })
        // Contract: newest first.
        .sort((a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1))
      return HttpResponse.json(paginate(rows, url))
    }),
  ),
]
