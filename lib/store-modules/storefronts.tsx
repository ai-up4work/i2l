// lib/store-modules/storefronts.tsx
//
// Server side: the customer page of each custom store (lib/store-modules).
// app/(public)/stores/[platform]/page.tsx renders this instead of the
// standard catalogue page when the store has a module.

import type { AffiliatedStore } from '@/data/stores/data'
import { storeModuleFor } from '@/lib/store-modules'
import { loadStorefront } from '@/lib/store-modules/casecraft/server'
import CaseCraftStorefront from '@/components/store-modules/casecraft/CaseCraftStorefront'
import StoreUnavailable from '@/components/stores/StoreUnavailable'

export async function ModuleStorefront({ store }: { store: AffiliatedStore }) {
  const mod = storeModuleFor(store.platform)
  if (mod?.key === 'casecraft') {
    const data = await loadStorefront(store.platform)
    if (!data) return <StoreUnavailable name={store.name} logo={store.logo} kind="paused" />
    return (
      <CaseCraftStorefront
        store={{
          platform: store.platform,
          name: store.name,
          logo: store.logo,
          cover: store.cover ?? null,
          tagline: store.tagline ?? null,
          description: store.description || null,
        }}
        data={data}
      />
    )
  }
  return null
}
