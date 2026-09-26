// app/seller/(dashboard)/account/page.tsx
//
// Lets a seller replace the temporary password staff gave them. Uses the
// seller's own session (supabase.auth.updateUser), so it can only ever
// change the logged-in account's password. Staff can issue a new
// temporary password from the admin seller page if one is forgotten.
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const MIN_LENGTH = 8

export default function SellerAccountPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`)
    if (password !== confirm) return setError('The two passwords don’t match.')

    setSaving(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setSaving(false)
    if (updateError) return setError(updateError.message)
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-2xl text-ink">Account</h2>
      <p className="mt-1 text-sm text-ink/55">
        Change the temporary password your Wishdrop contact gave you to one only you know.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-card p-6">
        <label className="text-sm font-semibold text-ink" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
        />
        <label className="mt-1 text-sm font-semibold text-ink" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        {done && <p className="text-sm font-medium text-teal-deep">Password changed. Use it next time you log in.</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-2 rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
