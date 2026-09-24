// lib/scrape/platform-view-props.ts
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { StoreCommercePanelProps } from '@/components/stores/StoreCommercePanel'

export type PlatformViewProps = Omit<StoreCommercePanelProps, 'result'> & {
  result: ScrapeResult
  onSelectVariant: (url: string) => void

  /** Reports the shopper's chosen variant options, e.g. { Size: 'M', Color: 'Navy' } */
  onSelectionChange?: (selection: Record<string, string>) => void

  /** Restores a previous selection after a variant re-scrape remounts the view */
  initialSelection?: Record<string, string> | null
}