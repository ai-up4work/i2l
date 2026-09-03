import { PackageCheck, PiggyBank, Users } from 'lucide-react'
import { statsBandItems } from './data'

// No icon field on statsBandItems yet — paired by index for now.
// Move into data.ts as an `icon` field if this needs to scale past 3 items.
const statIcons = [PackageCheck, PiggyBank, Users]

export default function StatsBand() {
  return (
    <section className="bg-gold px-6 py-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col divide-y divide-parchment/25 sm:flex-row sm:divide-x sm:divide-y-0">
        {statsBandItems.map((stat, index) => {
          const Icon = statIcons[index] ?? statIcons[0]
          return (
            <div
              key={stat.label}
              className="flex flex-1 items-center gap-3 py-4 first:pt-0 last:pb-0 sm:justify-center sm:py-0 sm:first:pl-0 sm:last:pr-0"
            >
              <div className="grid h-11 w-11 flex-none place-items-center rounded-full border border-parchment/40 text-parchment">
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold leading-none text-parchment">
                  {stat.value}
                </p>
                <p className="mt-1 font-body text-xs text-parchment/80">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}