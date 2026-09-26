# StockSense — Frontend

Inventory management UI (receipts, deliveries, adjustments, move history, stock) for the StockSense FastAPI backend.
The API contract in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) is the source of truth; `src/api/types.ts` mirrors it.

**Stack:** React 19 · TypeScript (strict) · Vite 8 · React Router 8 · TanStack Query 5 · react-hook-form + zod 4 · Tailwind 4 + shadcn/ui · lucide-react · sonner · date-fns · MSW 2.

## Run

Requires Node.js 20+ (built with 24 LTS).

```bash
npm install
cp .env.example .env      # VITE_USE_MOCKS=true → in-browser mock API, no backend needed
npm run dev               # http://localhost:5173
```

| `VITE_USE_MOCKS` | Behaviour |
|---|---|
| `true` | MSW serves every `/api/*` endpoint from an in-memory seed (`src/mocks/`). State resets on reload. Demo login is in `src/mocks/db.ts`. Password-reset codes are logged to the browser console. |
| `false` | `/api` is proxied by Vite to `http://localhost:8000` (the FastAPI backend). Same origin, so the httpOnly auth cookie just works. |

MSW needs service workers: use Chrome/Edge/Firefox on `localhost`. Some embedded browsers block them — the app then renders with a "Mock API failed to start" toast.

Other scripts: `npm run build` (typecheck + production build), `npm run lint` (oxlint), `npm run preview`.

## Layout

```
src/
  api/          client.ts (fetch wrapper → ApiError, 401 → /login), types.ts (contract), queryKeys.ts
  hooks/        one TanStack Query hook file per resource (useOperations, useStock, …)
  pages/        route screens (lazy-loaded, one chunk each)
  features/     screen building blocks: operations (form, kanban, table, print), products, settings
  components/   shared UI: layout (shell, auth gate), pickers, data tables, form fields, shadcn ui/
  lib/          validation (zod rules shared with mocks), formatting, form error mapping
  mocks/        MSW handlers per contract section + seed data (follows the contract's state rules)
```

## Conventions

- Server state only through TanStack Query; mutations invalidate what they affect (e.g. validate → operations, stock, moves, dashboard).
- The UI never computes stock — it shows `on_hand`, `free_to_use`, `is_short`, … as returned.
- List filters live in the URL (`?status=ready&late=true`), so views are linkable.
- No tokens in local/session storage; auth is the backend's httpOnly cookie.
