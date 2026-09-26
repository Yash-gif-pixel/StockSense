import { http, HttpResponse } from 'msw'
import type { Dashboard, OperationCounts, OperationType } from '@/api/types'
import { db, isPending, operationWarehouseId, productById, today } from '../db'
import { authed } from '../session'
import { stockRow } from './products'

export const dashboardHandlers = [
  http.get(
    '/api/dashboard',
    authed(({ request }) => {
      const p = new URL(request.url).searchParams
      const warehouseId = p.get('warehouse_id') ? Number(p.get('warehouse_id')) : undefined
      const categoryId = p.get('category_id') ? Number(p.get('category_id')) : undefined
      const t = today()

      const ops = db.operations.filter(
        (op) =>
          (warehouseId === undefined || operationWarehouseId(op) === warehouseId) &&
          (categoryId === undefined ||
            db.lines.some((l) => l.operation_id === op.id && productById(l.product_id)?.category_id === categoryId)),
      )

      // Contract definitions: pending = draft|waiting|ready; late = pending & date < today; upcoming = pending & date > today.
      const counts = (type: OperationType): OperationCounts => {
        const mine = ops.filter((o) => o.type === type)
        const pending = mine.filter((o) => isPending(o.status))
        return {
          ready: mine.filter((o) => o.status === 'ready').length,
          waiting: mine.filter((o) => o.status === 'waiting').length,
          late: pending.filter((o) => o.scheduled_date < t).length,
          upcoming: pending.filter((o) => o.scheduled_date > t).length,
          pending: pending.length,
        }
      }

      // As the backend: active products only; in_stock = on hand > 0, so it includes low stock.
      const rows = db.products.filter((pr) => pr.active && (categoryId === undefined || pr.category_id === categoryId)).map((pr) => stockRow(pr, warehouseId))

      const body: Dashboard = {
        receipts: counts('receipt'),
        deliveries: counts('delivery'),
        internal: { scheduled: ops.filter((o) => o.type === 'internal' && (o.status === 'waiting' || o.status === 'ready')).length },
        products: {
          in_stock: rows.filter((r) => r.on_hand > 0).length,
          low_stock: rows.filter((r) => r.status === 'low').length,
          out_of_stock: rows.filter((r) => r.status === 'out').length,
        },
      }
      return HttpResponse.json(body)
    }),
  ),
]
