// lib/scrape/platform-view-props.ts
import type { ScrapeResult } from '@/lib/scrape/parsers'
import type { StoreCommercePanelProps } from '@/components/stores/StoreCommercePanel'

export type PlatformViewProps = Omit<StoreCommercePanelProps, 'result'> & {
  result: ScrapeResult
  onSelectVariant: (url: string) => void
}