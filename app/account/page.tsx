'use client'

import { useState } from 'react'
import {
  Bell,
  Box,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Gift,
  Gavel,
  Home,
  Menu,
  PackagePlus,
  Search,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  X,
} from 'lucide-react'

const productImage = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-IwqbRFfEGB64ThFuBivfI6ut6y0wxI.png'

type Request = { id: string; name: string; price: string; status: 'Awaiting payment' | 'Requested'; image: string }

const initialRequests: Request[] = [
  { id: 'P003740746', name: 'HP EliteBook 840 G8 14" 16GB 256GB SSD Core i5-1145G7- Excellent condition', price: 'US$275', status: 'Awaiting payment', image: productImage },
]

const navGroups = [
  { label: '', items: [['Member Centre', Home], ['Shopping Community', FileText]] },
  { label: 'Start Forwarding & Shopping', items: [['Add request', PackagePlus], ['Add shipment', Box], ['Warehouse addresses', Store]] },
  { label: 'Track & Manage', items: [['Buying requests', ShoppingBag], ['Shipment orders', FileText], ['Bidding requests', Gavel]] },
  { label: 'Coupons & Rewards', items: [['Promo codes', Gift]] },
]

export default function Page() {
  const [page, setPage] = useState<'home' | 'requests'>('home')
  const [modal, setModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [requests, setRequests] = useState(initialRequests)
  const [activeTab, setActiveTab] = useState('Ready to Pay (1)')
  const [form, setForm] = useState({ url: '', name: '', price: '' })

  function openRequest() { setModal(true); setForm({ url: '', name: '', price: '' }) }
  function saveRequest(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return
    setRequests((current) => [{ id: `P${Math.floor(100000000 + Math.random() * 899999999)}`, name: form.name, price: form.price ? `US$${form.price}` : 'Price pending', status: 'Requested', image: productImage }, ...current])
    setModal(false); setPage('requests'); setActiveTab('Requested')
  }

  return (
    <main className="member-app">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-head"><button className="back-button" aria-label="Collapse menu" onClick={() => setMenuOpen(false)}><ChevronLeft /></button><button className="member-logo" onClick={() => setPage('home')}>INDIA<span>2</span>LANKA</button></div>
        <nav className="side-nav" aria-label="Member navigation">
          {navGroups.map((group) => <div className="nav-group" key={group.label || 'main'}>{group.label && <h3>{group.label}</h3>}{group.items.map(([label, Icon]) => <button key={label as string} className={(page === 'requests' && label === 'Buying requests') || (page === 'home' && label === 'Member Centre') ? 'nav-item active' : 'nav-item'} onClick={() => { if (label === 'Buying requests') setPage('requests'); if (label === 'Member Centre') setPage('home'); setMenuOpen(false) }}><Icon size={20} /><span>{label as string}</span></button>)}</div>)}
        </nav>
        <div className="download-app">Download App <span>●</span><span>▶</span></div>
      </aside>

      <section className="member-content">
        <header className="member-header"><button className="mobile-menu" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu /></button><div className="header-spacer" /><button className="invite"><Gift size={19} /> Invite & Earn</button><Bell className="bell" size={23} /><button className="avatar" aria-label="Account menu">S</button></header>
        {page === 'home' ? <HomePage onRequest={openRequest} /> : <RequestsPage requests={requests} activeTab={activeTab} setActiveTab={setActiveTab} onRequest={openRequest} />}
      </section>

      {modal && <div className="modal-backdrop" role="presentation"><form className="request-modal" onSubmit={saveRequest}><div className="modal-head"><h2>Item information</h2><button type="button" aria-label="Close" onClick={() => setModal(false)}><X /></button></div><div className="modal-body"><label>Item URL<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.store.com/product-link" /></label><label>Item name <b>*</b><textarea required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter the product name" /></label><label>Image <span className="muted">(for reference only)</span><div className="image-upload"><img src={productImage} alt="Product reference" /><span>Click to upload or drag an image here</span></div></label></div><div className="modal-foot"><div><span>Item Subtotal</span><strong>{form.price ? `US$${form.price}` : 'US$0'}</strong></div><label className="price-label">Price<input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" /></label><button className="orange-button" type="submit">Save</button></div></form></div>}
      <button className="chat-button" aria-label="Open support chat"><CircleHelp /></button>
    </main>
  )
}

function HomePage({ onRequest }: { onRequest: () => void }) {
  return <div className="dashboard-page"><div className="welcome-banner"><span><CircleHelp size={18} /> Welcome to INDIA2LANKA! Verify your phone number and get LKR 1,000 off your first order.</span><b>Details</b><X size={18} /></div><div className="dashboard-grid"><div className="dashboard-main"><h1>Hello, Safnas Kaldeen!</h1><p className="badge-line">You&apos;ve unlocked <b>0</b> badge(s) <span>App Exclusive</span></p><div className="stats-card"><div><strong>8</strong><span>Promo codes</span></div><div><strong>0</strong><span>My credits</span></div><div><strong>0</strong><span>My referrals</span></div></div><ServiceCard icon={Truck} title="Parcel forwarding" description="Get your overseas wishlist items at lower prices with our shipping service." button="Add shipment" /><ServiceCard icon={Gift} title="Global shopping" description="Simply place an order with us for that hard-to-find item. We'll handle the rest." button="Add request" onClick={onRequest} /><h2 className="subheading">Exclusive offers</h2></div><InfoRail /></div></div>
}

function ServiceCard({ icon: Icon, title, description, button, onClick }: { icon: typeof Truck; title: string; description: string; button: string; onClick?: () => void }) { return <div className="service-card"><div className="service-symbol"><Icon /></div><div className="service-copy"><h2>{title}</h2><p>{description}</p></div><div className="service-actions"><button className="orange-button" onClick={onClick}><PackagePlus size={18} /> {button}</button><a href="#guide">Step-by-step guide <ChevronRight size={16} /></a></div></div> }

function InfoRail() { return <aside className="info-rail"><div className="info-card"><h3>Official partner <span>•••</span></h3><div className="ebay">e<span>b</span>ay</div><p>Official marketplace partner — shop with ease and ship to your door</p><a href="#products">EXPLORE PRODUCTS <ChevronRight size={17} /></a></div><div className="info-card"><h3>Relevant Information</h3><a href="#prohibited">Prohibited items <ChevronRight size={15} /></a><a href="#pickup">Self-pickup points <ChevronRight size={15} /></a></div></aside> }

function RequestsPage({ requests, activeTab, setActiveTab, onRequest }: { requests: Request[]; activeTab: string; setActiveTab: (tab: string) => void; onRequest: () => void }) { const tabs = ['Requested', `Ready to Pay (${requests.filter((r) => r.status === 'Awaiting payment').length})`, 'In Progress', 'Purchased', 'Cancelled']; const visible = activeTab.startsWith('Ready') ? requests.filter((r) => r.status === 'Awaiting payment') : activeTab === 'Requested' ? requests.filter((r) => r.status === 'Requested') : []; return <div className="requests-page"><div className="requests-title"><h1>Buying requests</h1><button className="orange-button" onClick={onRequest}><PackagePlus size={18} /> Add request</button></div><div className="tabs">{tabs.map((tab) => <button className={activeTab === tab ? 'tab active' : 'tab'} key={tab} onClick={() => setActiveTabs(setActiveTab, tab)}>{tab}</button>)}</div>{visible.length ? visible.map((request) => <RequestCard request={request} key={request.id} />) : <div className="empty-state"><Search size={28} /><h2>No {activeTab.toLowerCase()} yet</h2><p>Add a product link and we&apos;ll help bring it home.</p><button className="orange-button" onClick={onRequest}>Add request</button></div>}</div> }
function setActiveTabs(setter: (tab: string) => void, tab: string) { setter(tab) }
function RequestCard({ request }: { request: Request }) { return <article className="request-card"><div className="merchant"><Store size={17} /> eBay</div><div className="product-row"><img src={request.image} alt="Product" /><div><h2>{request.name}</h2><span>x1</span><strong>{request.price}</strong></div></div><div className="request-meta"><div><span>Status</span><b className="status">{request.status}</b></div><div><span>Request No.</span><b>{request.id}</b></div></div>{request.status === 'Awaiting payment' && <div className="payment-bar"><div><strong>Total HK$2,509</strong><span>Time remaining: 1day(s) 21h</span></div><button className="orange-button">Pay now</button></div>}</article> }
