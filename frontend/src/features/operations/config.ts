import type { OperationStatus, OperationType } from '@/api/types'

export const STATUS_LABEL: Record<OperationStatus, string> = {
  draft: 'Draft',
  waiting: 'Waiting',
  ready: 'Ready',
  done: 'Done',
  canceled: 'Canceled',
}

export interface OperationTypeConfig {
  type: OperationType
  title: string
  singular: string
  basePath: string
  /** Label of the `contact` field on the form. */
  contactLabel: string
  /** Which end of the move the user picks: receipts pick where goods arrive, deliveries where they leave from. */
  locationField: 'dest' | 'source'
  locationLabel: string
  /** Status bar steps (canceled is shown separately). */
  steps: OperationStatus[]
}

export const RECEIPT: OperationTypeConfig = {
  type: 'receipt',
  title: 'Receipts',
  singular: 'Receipt',
  basePath: '/operations/receipts',
  contactLabel: 'Receive From',
  locationField: 'dest',
  locationLabel: 'Destination Location',
  steps: ['draft', 'ready', 'done'],
}

export const DELIVERY: OperationTypeConfig = {
  type: 'delivery',
  title: 'Deliveries',
  singular: 'Delivery',
  basePath: '/operations/deliveries',
  contactLabel: 'Contact',
  locationField: 'source',
  locationLabel: 'Source Location',
  steps: ['draft', 'waiting', 'ready', 'done'],
}

/** Moves stock between two internal locations; no contact. `locationField` is the source, the form adds a destination. */
export const INTERNAL: OperationTypeConfig = {
  type: 'internal',
  title: 'Internal Transfers',
  singular: 'Internal Transfer',
  basePath: '/operations/internal',
  contactLabel: 'Contact',
  locationField: 'source',
  locationLabel: 'Source Location',
  steps: ['draft', 'waiting', 'ready', 'done'],
}

export function configFor(type: OperationType): OperationTypeConfig | undefined {
  return type === 'receipt' ? RECEIPT : type === 'delivery' ? DELIVERY : type === 'internal' ? INTERNAL : undefined
}

/** Detail page for an operation, when the app has one for its type. */
export function operationPath(op: { id: number; type: OperationType }): string | undefined {
  const cfg = configFor(op.type)
  return cfg && `${cfg.basePath}/${op.id}`
}
