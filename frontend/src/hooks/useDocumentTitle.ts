import { useEffect } from 'react'

/** Sets the browser tab title, e.g. "Receipts · StockSense". */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · StockSense` : 'StockSense'
  }, [title])
}
