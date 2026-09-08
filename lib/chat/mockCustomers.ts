export type MockCustomer = {
  id: string
  name: string
  handle: string
}

// Stand-in customer directory for the ops-console demo. A real ops
// console would fetch this from a backend; here it's just enough to
// drive the sidebar list and let each customer's thread be looked up
// by id via storageKeyFor(customer.id).
export const MOCK_CUSTOMERS: MockCustomer[] = [
  // Matches AuthContext's MOCK_USER — same email = same storage key,
  // so messages sent from the customer-facing ChatPanel while logged
  // in as the mock user actually show up here.
  { id: 'safnas@gmail.com', name: 'Safnas Kaldeen', handle: '@safnas' },
  { id: 'nadia@example.com', name: 'Nadia Perera', handle: '@nadia' },
  { id: 'kavi@example.com', name: 'Kavindu Silva', handle: '@kavi' },
  { id: 'ishara@example.com', name: 'Ishara Fernando', handle: '@ishara' },
  { id: 'ruwan@example.com', name: 'Ruwan Jayasuriya', handle: '@ruwan' },
  { id: 'dilani@example.com', name: 'Dilani Wickramasinghe', handle: '@dilani' },
]

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
}