// Mirrors docs/API_CONTRACT.md (v1) exactly. Field names are snake_case on purpose.
// Do not add fields here that the contract does not define.

// ---------- Primitives ----------

/** "YYYY-MM-DD" */
export type DateString = string
/** ISO 8601 with timezone offset */
export type Timestamp = string
export type ID = number

// ---------- Enums ----------

export type OperationType = 'receipt' | 'delivery' | 'internal' | 'adjustment'
export type OperationStatus = 'draft' | 'waiting' | 'ready' | 'done' | 'canceled'
export type LocationType = 'internal' | 'vendor' | 'customer' | 'adjustment'
export type MoveDirection = 'in' | 'out' | 'internal'
export type StockStatus = 'ok' | 'low' | 'out'
export type AdjustReason = 'count' | 'damaged' | 'lost' | 'other'

export const OPERATION_TYPES: readonly OperationType[] = ['receipt', 'delivery', 'internal', 'adjustment']
export const OPERATION_STATUSES: readonly OperationStatus[] = ['draft', 'waiting', 'ready', 'done', 'canceled']
export const ADJUST_REASONS: readonly AdjustReason[] = ['count', 'damaged', 'lost', 'other']

// ---------- Errors & lists ----------

export type ApiErrorCode =
  | 'validation_error' // 422
  | 'unauthorized' // 401
  | 'not_found' // 404
  | 'conflict' // 409
  | 'invalid_state' // 409
  | 'insufficient_stock' // 409
  | 'invalid_otp' // 400 (reset-password only)

export interface ApiErrorBody {
  code: ApiErrorCode | (string & {})
  message: string
  /** Only present on validation errors */
  fields?: Record<string, string>
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

export interface PageParams {
  /** default 50, max 200 */
  limit?: number
  /** default 0 */
  offset?: number
}

// ---------- Objects ----------

export interface User {
  id: ID
  login_id: string
  email: string
  created_at: Timestamp
}

export interface Warehouse {
  id: ID
  name: string
  short_code: string
  address: string
}

export interface Location {
  id: ID
  warehouse_id: ID | null
  name: string
  short_code: string
  /** e.g. "WH/Stock1"; virtual ones e.g. "Vendors", "Customers" */
  full_name: string
  type: LocationType
}

export interface Category {
  id: ID
  name: string
}

export interface Product {
  id: ID
  name: string
  sku: string
  category: Category | null
  uom: string
  unit_cost: number
  min_qty: number | null
  active: boolean
}

export interface StockRow {
  product: Product
  on_hand: number
  reserved: number
  /** on_hand - reserved (computed by the backend) */
  free_to_use: number
  status: StockStatus
}

export interface LocationStockRow {
  location: Location
  on_hand: number
  reserved: number
  free_to_use: number
}

export interface OperationSummary {
  id: ID
  reference: string
  type: OperationType
  status: OperationStatus
  contact: string | null
  source_location: Location
  dest_location: Location
  scheduled_date: DateString
  is_late: boolean
}

export interface OperationLine {
  id: ID
  product: Product
  qty: number
  /** Only meaningful for delivery/internal in draft/waiting, else null */
  free_to_use_at_source: number | null
  /** Only meaningful for delivery/internal in draft/waiting, else false */
  is_short: boolean
}

export interface OperationDetail extends OperationSummary {
  delivery_address: string | null
  responsible: { id: ID; login_id: string }
  created_at: Timestamp
  validated_at: Timestamp | null
  lines: OperationLine[]
}

export interface Move {
  id: ID
  created_at: Timestamp
  reference: string
  operation_id: ID
  contact: string | null
  product: { id: ID; name: string; sku: string }
  from_location: Location
  to_location: Location
  qty: number
  direction: MoveDirection
}

export interface OperationCounts {
  ready: number
  waiting: number
  late: number
  upcoming: number
  pending: number
}

export interface Dashboard {
  receipts: OperationCounts
  deliveries: OperationCounts
  internal: { scheduled: number }
  products: { in_stock: number; low_stock: number; out_of_stock: number }
}

// ---------- Request bodies ----------

export interface SignupBody {
  login_id: string
  email: string
  password: string
}

export interface LoginBody {
  login_id: string
  password: string
}

export interface ChangePasswordBody {
  current_password: string
  new_password: string
}

export interface ForgotPasswordBody {
  email: string
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordBody {
  email: string
  otp: string
  new_password: string
}

export interface WarehouseBody {
  name: string
  short_code: string
  address: string
}

export interface LocationCreateBody {
  warehouse_id: ID
  name: string
  short_code: string
}

export interface LocationUpdateBody {
  name: string
  short_code: string
}

export interface CategoryBody {
  name: string
}

export interface ProductCreateBody {
  name: string
  sku: string
  category_id: ID | null
  uom: string
  unit_cost: number
  min_qty: number | null
  initial_qty?: number
  initial_location_id?: ID
}

export interface ProductUpdateBody {
  name: string
  sku: string
  category_id: ID | null
  uom: string
  unit_cost: number
  min_qty: number | null
  active: boolean
}

export interface StockAdjustBody {
  product_id: ID
  location_id: ID
  counted_qty: number
  reason: AdjustReason
  note?: string
}

export interface StockAdjustResponse {
  changed: boolean
  operation: OperationDetail | null
}

export interface OperationLineInput {
  product_id: ID
  qty: number
}

export interface ReceiptBody {
  type: 'receipt'
  contact: string
  dest_location_id: ID
  scheduled_date: DateString
  lines: OperationLineInput[]
}

export interface DeliveryBody {
  type: 'delivery'
  contact: string
  delivery_address: string
  source_location_id: ID
  scheduled_date: DateString
  lines: OperationLineInput[]
}

export interface InternalBody {
  type: 'internal'
  source_location_id: ID
  dest_location_id: ID
  scheduled_date: DateString
  lines: OperationLineInput[]
}

/** Adjustments are created only via POST /api/stock/adjust */
export type OperationBody = ReceiptBody | DeliveryBody | InternalBody

export type OperationAction = 'todo' | 'check-availability' | 'validate' | 'cancel'

// ---------- Query params ----------

export interface LocationListParams extends PageParams {
  warehouse_id?: ID
  /** defaults to internal on the server */
  type?: LocationType
}

export interface ProductListParams extends PageParams {
  search?: string
  category_id?: ID
  active?: boolean
}

export interface StockListParams extends PageParams {
  search?: string
  warehouse_id?: ID
  category_id?: ID
  status?: StockStatus
}

export interface OperationListParams extends PageParams {
  type?: OperationType
  /** one or more; sent comma-separated */
  status?: OperationStatus | OperationStatus[]
  warehouse_id?: ID
  category_id?: ID
  search?: string
  late?: boolean
}

export interface MoveListParams extends PageParams {
  search?: string
  product_id?: ID
  location_id?: ID
  direction?: MoveDirection
  date_from?: DateString
  date_to?: DateString
}

export interface DashboardParams {
  warehouse_id?: ID
  category_id?: ID
}
