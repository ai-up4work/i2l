// app/account/messages/serviceRecords/page.tsx
//
// This used to be a byte-for-byte duplicate of app/account/messages/page.tsx
// (same "My Messages" chat UI, copy-pasted under a different route) rather
// than anything actually about service records. Redirecting instead of
// maintaining two copies of the same real implementation.
import { redirect } from 'next/navigation'

export default function ServiceRecordsRedirect() {
  redirect('/account/messages')
}
