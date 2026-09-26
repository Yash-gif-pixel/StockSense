// Contract sections already served by the real backend (reached through the Vite /api proxy).
// Their MSW handlers are switched off and requests pass through to the network.
// Add a section here when the backend dev says it is live.
export const LIVE = {
  auth: true,
  /** /api/operations and /api/operations/* (lists incl. adjustments, detail, create/update, actions) */
  operations: true,
} as const
