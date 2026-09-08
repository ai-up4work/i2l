export type MockCustomer = {
  id: string
  name: string
  handle: string
  profilePicUrl: string
}

// Stand-in customer directory for the ops-console demo. A real ops
// console would fetch this from a backend; here it's just enough to
// drive the sidebar list and let each customer's thread be looked up
// by id via storageKeyFor(customer.id).
export const MOCK_CUSTOMERS: MockCustomer[] = [
  // Matches AuthContext's MOCK_USER — same email = same storage key,
  // so messages sent from the customer-facing ChatPanel while logged
  // in as the mock user actually show up here.
  { id: 'safnas@gmail.com', name: 'Safnas Kaldeen', handle: '@safnas', profilePicUrl: '/default-avatar.png' },
  { id: 'nadia@example.com', name: 'Nadia Perera', handle: '@nadia', profilePicUrl: '/default-avatar.png' },
  { id: 'kavi@example.com', name: 'Kavindu Silva', handle: '@kavi', profilePicUrl: '/default-avatar.png' },
  { id: 'ishara@example.com', name: 'Ishara Fernando', handle: '@ishara', profilePicUrl: '/default-avatar.png' },
  { id: 'ruwan@example.com', name: 'Ruwan Jayasuriya', handle: '@ruwan', profilePicUrl: '/default-avatar.png' },
  { id: 'dilani@example.com', name: 'Dilani Wickramasinghe', handle: '@dilani', profilePicUrl: '/default-avatar.png' },
]

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
}