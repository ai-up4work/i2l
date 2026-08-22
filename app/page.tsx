'use client'

import { useState } from 'react'
import { ArrowRight, ChevronDown, Menu, Package, Search, ShieldCheck, ShoppingBag, Truck, X } from 'lucide-react'

const services = [
  { icon: Package, title: 'Parcel forwarding', text: 'Shop from stores abroad, send your parcels to our warehouse, and we deliver them to Sri Lanka.' },
  { icon: ShoppingBag, title: 'Global shopping', text: 'Share a product link and our team will purchase hard-to-find items for you.' },
  { icon: Truck, title: 'Fast delivery', text: 'Choose the shipping option that works for you and track every step to your door.' },
]

export default function LandingPage() {
  const [menu, setMenu] = useState(false)
  const [link, setLink] = useState('')
  const [submitted, setSubmitted] = useState(false)
  return <main className="landing">
    <div className="top-strip">Shop the world from Sri Lanka with confidence</div>
    <header className="landing-header"><a className="brand" href="/">INDIA<span>2</span>LANKA</a><nav className={menu ? 'landing-nav open' : 'landing-nav'}><a href="#shipping">Shipping <ChevronDown size={15}/></a><a href="#shopping">Shopping <ChevronDown size={15}/></a><a href="#how">How it works</a><a href="#help">Support</a></nav><div className="header-actions"><a href="/account" className="login-link">Log in</a><a href="/account" className="primary-small">Sign up</a><button className="menu-toggle" aria-label="Toggle menu" onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div></header>
    <section className="landing-hero"><div className="hero-copy"><p className="eyebrow">GLOBAL SHOPPING, MADE SIMPLE</p><h1>Shop worldwide.<br/><em>Delivered home.</em></h1><p className="hero-lead">Access the products you love from India and around the world. We handle the buying, forwarding, and delivery to Sri Lanka.</p><div className="hero-buttons"><a href="/account" className="primary-button">Start shopping <ArrowRight size={18}/></a><a href="#how" className="text-button">See how it works <ArrowRight size={16}/></a></div><div className="hero-trust"><ShieldCheck size={19}/> Secure payments <span/> Transparent pricing <span/> Real-time tracking</div></div><div className="hero-visual"><div className="route-line"/><div className="city-card city-one"><b>IN</b><small>India</small></div><div className="city-card city-two"><b>LK</b><small>Sri Lanka</small></div><div className="parcel-box"><Package size={58}/><strong>Your wishlist</strong><small>is on its way</small></div><div className="visual-note">Reliable delivery, every time</div></div></section>
    <section className="quick-panel"><div className="panel-title"><span>What would you like to do?</span><small>Choose a service to get started</small></div><div className="quick-actions"><a href="/account"><Package size={22}/><span><b>Send a shipment</b><small>Already bought something?</small></span><ArrowRight/></a><a href="/account"><ShoppingBag size={22}/><span><b>Buy something for me</b><small>Share a product link</small></span><ArrowRight/></a><a href="#track"><Search size={22}/><span><b>Track my parcel</b><small>See your delivery status</small></span><ArrowRight/></a></div></section>
    <section className="benefits" id="shipping"><p className="eyebrow">WHY INDIA2LANKA</p><h2>Everything you need to shop beyond borders.</h2><div className="benefit-grid">{services.map(({icon: Icon,title,text}) => <article key={title}><div className="benefit-icon"><Icon/></div><h3>{title}</h3><p>{text}</p><a href="/account">Learn more <ArrowRight size={15}/></a></article>)}</div></section>
    <section className="shopping-cta" id="shopping"><div><p className="eyebrow">YOUR WORLDWIDE SHOPPING PARTNER</p><h2>Find it online.<br/><em>We&apos;ll bring it home.</em></h2><p>From fashion and electronics to everyday essentials, your next find is closer than you think.</p><a href="/account" className="light-button">Create your account <ArrowRight size={17}/></a></div><div className="stores-card"><span>Popular destinations</span><strong>India</strong><strong>United Kingdom</strong><strong>United States</strong><strong>Dubai</strong></div></section>
    <section className="how-section" id="how"><p className="eyebrow">HOW IT WORKS</p><h2>From link to doorstep in four easy steps.</h2><div className="steps"><div><b>01</b><h3>Share your link</h3><p>Send us the product you want to buy.</p></div><div><b>02</b><h3>We purchase</h3><p>Our team confirms the details and price.</p></div><div><b>03</b><h3>We receive</h3><p>Your item arrives at our overseas warehouse.</p></div><div><b>04</b><h3>We deliver</h3><p>Track your parcel all the way to Sri Lanka.</p></div></div></section>
    <section className="link-cta" id="track"><div><h2>Have a product link?</h2><p>Paste it here and start your request.</p></div><form onSubmit={(e) => { e.preventDefault(); if (link) setSubmitted(true) }}><div><Search size={18}/><input aria-label="Product link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a product link"/></div><button type="submit">{submitted ? 'Request started' : 'Submit request'} <ArrowRight size={17}/></button></form></section>
    <footer id="help"><a className="brand" href="/">INDIA<span>2</span>LANKA</a><p>Shop more. Wait less. Delivered home.</p><span>© 2026 INDIA2LANKA</span></footer>
  </main>
}
