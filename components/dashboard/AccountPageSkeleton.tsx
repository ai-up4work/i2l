'use client'

export default function AccountPageSkeleton() {
  return (
    <div className="account-skeleton" aria-label="Loading page" role="status">
      <span className="sr-only">Loading page</span>
      <div className="account-skeleton__heading" />
      <div className="account-skeleton__subheading" />
      <div className="account-skeleton__grid">
        <div className="account-skeleton__card account-skeleton__card--large" />
        <div className="account-skeleton__card" />
        <div className="account-skeleton__card" />
      </div>
      <div className="account-skeleton__rows">
        <div className="account-skeleton__row" />
        <div className="account-skeleton__row" />
        <div className="account-skeleton__row" />
      </div>
    </div>
  )
}

