import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * List filters live in the URL so they survive reloads and can be linked to.
 * Setting any filter resets `offset` (back to page 1) unless offset itself is being set.
 */
export function useUrlParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams])
  const getNumber = useCallback(
    (key: string) => {
      const v = searchParams.get(key)
      return v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)
    },
    [searchParams],
  )

  const set = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === null || v === '') next.delete(k)
            else next.set(k, String(v))
          }
          if (!('offset' in updates)) next.delete('offset')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { get, getNumber, set }
}
