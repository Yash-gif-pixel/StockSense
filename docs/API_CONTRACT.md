# StockSense API Contract v1

## Conventions
* Base path: /api. JSON only. Field names snake_case. IDs are integers.
* Dates: scheduled_date is "YYYY-MM-DD". Timestamps are ISO 8601 in UTC with a trailing Z (e.g. 2026-09-26T06:25:47.304422Z).
* Quantities and money are JSON numbers.
* Auth: POST /api/auth/login sets an httpOnly cookie. Every endpoint except signup/login/forgot/reset requires it; otherwise 401.
* Errors (all non-2xx): {"code": "string", "message": "human readable", "fields": {"field_name": "message"}}  (fields present on validation_error, and on conflict when a specific field caused it)
  Codes: validation_error (422), unauthorized (401), not_found (404), conflict (409), invalid_state (409), insufficient_stock (409)
* Lists: {"items": [...], "total": n}. Query params limit (default 50, max 200), offset (default 0).

## Enums
operation.type: receipt | delivery | internal | adjustment
operation.status: draft | waiting | ready | done | canceled
location.type: internal | vendor | customer | adjustment   (only internal locations are shown in pickers)
move.direction: in | out | internal
stock status: ok | low | out
adjust reason: count | damaged | lost | other

## Objects
User {id, login_id, email, created_at}
Warehouse {id, name, short_code, address}
Location {id, warehouse_id|null, name, short_code, full_name, type}      full_name e.g. "WH/Stock1"; virtual ones e.g. "Vendors", "Customers"
Category {id, name}
Product {id, name, sku, category: Category|null, uom, unit_cost, min_qty|null, active}
StockRow {product: Product, on_hand, reserved, free_to_use, status}
   free_to_use = on_hand - reserved
   status: out if on_hand <= 0; low if min_qty set and on_hand <= min_qty; else ok
OperationSummary {id, reference, type, status, contact|null, source_location: Location, dest_location: Location, scheduled_date, is_late}
OperationDetail = OperationSummary + {delivery_address|null, responsible: {id, login_id}, created_at, validated_at|null,
   lines: [{id, product: Product, qty, free_to_use_at_source|null, is_short}]}
   free_to_use_at_source and is_short are only meaningful for delivery/internal in draft/waiting (else null/false).
Move {id, created_at, reference, operation_id, contact|null, product: {id, name, sku}, from_location: Location, to_location: Location, qty, direction}

## Auth
   signup does NOT log the user in: 201 with no cookie; the client redirects to /login
   email is stored and returned fully lower-cased
POST /api/auth/signup {login_id, email, password} -> 201 User
   login_id: 6–12 chars, [A-Za-z0-9_.], unique (409 conflict)
   email: valid, unique case-insensitive (409 conflict)
   password: more than 8 chars (min 9), at least one lowercase, one uppercase, one special character
POST /api/auth/login {login_id, password} -> 200 User + cookie. Wrong creds -> 401 message "Invalid Login Id or Password"
POST /api/auth/logout -> 204 (clears cookie)
GET  /api/auth/me -> User
POST /api/auth/change-password {current_password, new_password} -> 204. Wrong current_password -> 422 validation_error with fields.current_password
POST /api/auth/forgot-password {email} -> 200 {"message": "..."} ALWAYS (even if email unknown)
POST /api/auth/reset-password {email, otp, new_password} -> 204. Bad/expired/used OTP -> 400 code "invalid_otp"

## Settings
GET  /api/warehouses -> {items: Warehouse[], total}
POST /api/warehouses {name, short_code, address} -> 201 Warehouse   (auto-creates internal location "Stock")
PUT  /api/warehouses/{id} {name, short_code, address} -> Warehouse
GET  /api/locations?warehouse_id=&type=internal -> {items: Location[], total}   (type defaults to internal)
POST /api/locations {warehouse_id, name, short_code} -> 201 Location
PUT  /api/locations/{id} {name, short_code} -> Location

## Products & stock
GET  /api/categories -> {items: Category[], total}
POST /api/categories {name} -> 201 Category
GET  /api/products?search=&category_id=&active= -> {items: Product[], total}     search matches name or sku
POST /api/products {name, sku, category_id|null, uom, unit_cost, min_qty|null, initial_qty?, initial_location_id?} -> 201 Product
   if initial_qty > 0, backend records it as a done adjustment (appears in move history)
PUT  /api/products/{id} {name, sku, category_id, uom, unit_cost, min_qty, active} -> Product
GET  /api/stock?search=&warehouse_id=&category_id=&status= -> {items: StockRow[], total}
GET  /api/stock/{product_id}/locations -> {items: [{location: Location, on_hand, reserved, free_to_use}], total}
POST /api/stock/adjust {product_id, location_id, counted_qty, reason, note?} -> {changed: bool, operation: OperationDetail|null}
   counted_qty below reserved qty -> 409 conflict

## Operations
GET  /api/operations?type=&status=&warehouse_id=&category_id=&search=&late= -> {items: OperationSummary[], total}
   status accepts comma-separated values; search matches reference or contact
GET  /api/operations/{id} -> OperationDetail
POST /api/operations -> 201 OperationDetail (status draft). Body by type:
   receipt:  {type, contact, dest_location_id, scheduled_date, lines: [{product_id, qty}]}
   delivery: {type, contact, delivery_address, source_location_id, scheduled_date, lines}
   internal: {type, source_location_id, dest_location_id, scheduled_date, lines}
   (adjustments are created only via POST /api/stock/adjust)
PUT  /api/operations/{id} same body -> OperationDetail   (draft only, else 409 invalid_state)
POST /api/operations/{id}/todo               draft -> ready (receipt) | ready or waiting (delivery/internal, based on stock)
POST /api/operations/{id}/check-availability waiting -> ready if stock now available (else stays waiting)
POST /api/operations/{id}/validate           ready -> done (stock moves written)
POST /api/operations/{id}/cancel             draft|waiting|ready -> canceled (reservation released)
   All actions return OperationDetail. Wrong state -> 409 invalid_state.

## Moves
GET /api/moves?search=&product_id=&location_id=&direction=&date_from=&date_to= -> {items: Move[], total}
   one row per product per operation; newest first

## Dashboard
GET /api/dashboard?warehouse_id=&category_id= ->
{
  "receipts":   {"ready": n, "waiting": n, "late": n, "upcoming": n, "pending": n},
  "deliveries": {"ready": n, "waiting": n, "late": n, "upcoming": n, "pending": n},
  "internal":   {"scheduled": n},
  "products":   {"in_stock": n, "low_stock": n, "out_of_stock": n}
}
Definitions: pending = status in (draft, waiting, ready); late = pending AND scheduled_date < today;
upcoming = pending AND scheduled_date > today; internal.scheduled = internal ops in (waiting, ready).
