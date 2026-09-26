import { pageMetadata } from '@/lib/seo'
export const metadata = pageMetadata({
  path: '/stores',
  title: 'Affiliated Stores | Wishdrop',
  description:
    'Browse every store Wishdrop can buy from — Indian marketplaces, boutiques, and international sellers — with delivery to Sri Lanka.',
})

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  return children
}
