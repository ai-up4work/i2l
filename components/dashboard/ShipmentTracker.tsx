"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LucideIcon } from "lucide-react"
import { Package, MapPin, Truck, CheckCircle2, Clock, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"

function SquircleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        <clipPath id="squircle-clip" clipPathUnits="objectBoundingBox">
          <path
            d="M 0.5,0
               C 0.888,0 0.917,0.021 0.946,0.05
               C 0.976,0.079 1,0.109 1,0.5
               C 1,0.892 0.976,0.921 0.946,0.95
               C 0.917,0.979 0.888,1 0.5,1
               C 0.113,1 0.083,0.979 0.054,0.95
               C 0.024,0.921 0,0.892 0,0.5
               C 0,0.109 0.024,0.079 0.054,0.05
               C 0.083,0.021 0.113,0 0.5,0
               Z"
          />
        </clipPath>
      </defs>
    </svg>
  )
}

type ThumbnailItem = {
  image: string
  name: string
}

const STACK_OFFSET = 10

function OrderThumbnail({ items, size = 80 }: { items: ThumbnailItem[]; size?: number }) {
  if (items.length === 1) {
    return (
      <img
        src={items[0].image}
        alt={items[0].name}
        className="flex-none bg-muted object-cover [clip-path:url(#squircle-clip)]"
        style={{ height: size, width: size }}
      />
    )
  }

  const visible = items.slice(0, 3)
  const overflow = items.length - visible.length
  const chip = Math.round(size * 0.62)
  const totalWidth = chip + (visible.length - 1) * STACK_OFFSET

  return (
    <div className="relative flex-none" style={{ height: size, width: totalWidth }}>
      {visible.map((item, i) => (
        <img
          key={i}
          src={item.image}
          alt={item.name}
          className="absolute bottom-0 border-2 border-background bg-muted object-cover [clip-path:url(#squircle-clip)]"
          style={{ height: chip, width: chip, left: i * STACK_OFFSET, zIndex: visible.length - i }}
        />
      ))}
      {overflow > 0 && (
        <span
          className="absolute -right-1 -top-1 flex items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background"
          style={{ height: 18, minWidth: 18, padding: "0 4px" }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

const orderItems: ThumbnailItem[] = [
  { image: "/product-image.jpg", name: "Wireless Headphones" },
  { image: "/product-image-2.jpg", name: "Charging Case" },
  { image: "/product-image-3.jpg", name: "USB-C Cable" },
]

const trackingEvents = [
  {
    status: "Delivered",
    location: "San Francisco, CA 94103",
    date: "Oct 21, 2025",
    time: "2:45 PM",
    description: "Package delivered to front door",
    completed: true,
  },
  {
    status: "Out for Delivery",
    location: "San Francisco, CA",
    date: "Oct 21, 2025",
    time: "8:30 AM",
    description: "Package is on the delivery vehicle",
    completed: true,
  },
  {
    status: "In Transit",
    location: "Oakland, CA",
    date: "Oct 20, 2025",
    time: "11:20 PM",
    description: "Package arrived at local facility",
    completed: true,
  },
  {
    status: "In Transit",
    location: "Los Angeles, CA",
    date: "Oct 19, 2025",
    time: "3:15 PM",
    description: "Package departed facility",
    completed: true,
  },
  {
    status: "Order Placed",
    location: "Warehouse",
    date: "Oct 18, 2025",
    time: "10:00 AM",
    description: "Order confirmed and processed",
    completed: true,
  },
]

const timelineStatusConfig: Record<
  string,
  {
    icon: LucideIcon
    containerClass: string
    iconClass: string
  }
> = {
  Delivered: {
    icon: CheckCircle2,
    containerClass: "border border-success/40 bg-success/10",
    iconClass: "text-success",
  },
  "Out for Delivery": {
    icon: Truck,
    containerClass: "border border-primary/40 bg-primary/10",
    iconClass: "text-primary",
  },
  "In Transit": {
    icon: Clock,
    containerClass: "border border-muted-foreground/30 bg-muted",
    iconClass: "text-muted-foreground",
  },
  "Order Placed": {
    icon: Package,
    containerClass: "border border-border bg-background",
    iconClass: "text-muted-foreground",
  },
}

const timelineDefaultStatus = {
  icon: Clock,
  containerClass: "border border-border bg-background",
  iconClass: "text-muted-foreground",
}

const timelineCompletedStatus = {
  icon: CheckCircle2,
  containerClass: "border border-success/40 bg-success/10",
  iconClass: "text-success",
}

export function ShipmentTracker() {
  const [open, setOpen] = useState(false)

  const copyTrackingNumber = () => {
    navigator.clipboard.writeText("TRK1234567890")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SquircleDefs />
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Package className="h-5 w-5" />
          View Order Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl p-0 overflow-hidden">
        <DialogHeader className=" gap-4 px-6 pt-6 text-center">
          <div className="flex justify-center">
            <OrderThumbnail items={orderItems} size={72} />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-md">Order #ORD-2025-1021</DialogTitle>
            <DialogDescription>Track your shipment and view order details</DialogDescription>
          </div>
        </DialogHeader>

        <div className="mx-5 rounded-xl border border-success/20 bg-success/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">Delivered</h3>
                <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-xs">
                  Completed
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">Oct 21, 2025 at 2:45 PM</p>
            </div>
          </div>
        </div>

        <div className="mx-5 flex flex-col" style={{ height: "calc(90vh - 240px)" }}>
          <Tabs defaultValue="tracking" className="flex h-full flex-col overflow-hidden">
            <TabsList className="w-full justify-start rounded-xl">
              <TabsTrigger value="tracking" className="gap-2">
                <Truck className="h-4 w-4" />
                Tracking
              </TabsTrigger>
              <TabsTrigger value="details" className="gap-2">
                <Package className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="delivery" className="gap-2">
                <MapPin className="h-4 w-4" />
                Delivery
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tracking" className="mt-0 flex-1 overflow-y-auto pb-6 scrollbar-hide">
              <div className="space-y-5 pt-2">
                <Card className="p-4 shadow-none bg-background">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Carrier</p>
                      <div className="flex items-center gap-2">
                        <img
                          src="/circle-fedex-icon-png-logo-12.png"
                          alt="FedEx Express logo"
                          width={20}
                          height={20}
                          className="rounded-sm"
                        />
                        <p className="font-medium text-sm">FedEx Express</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Tracking Number</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium">TRK1234567890</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyTrackingNumber}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full bg-transparent" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Track on Carrier Site
                  </Button>
                </Card>

                <div className="space-y-4">
                  <div className="space-y-4">
                    {trackingEvents.map((event, index) => {
                      const isLatest = index === 0
                      const statusConfig = isLatest
                        ? timelineStatusConfig[event.status] ?? timelineDefaultStatus
                        : timelineCompletedStatus
                      const StatusIcon = statusConfig.icon

                      return (
                        <div key={index} className="relative flex gap-3">
                          {index !== trackingEvents.length - 1 && (
                            <div className="absolute left-[13px] top-6 h-full w-px bg-border" />
                          )}
                          <div className="relative flex-shrink-0">
                            <div
                              className={`flex h-7 w-7 border-none items-center justify-center rounded-full ${statusConfig.containerClass}`}
                            >
                              <StatusIcon className={`h-4 w-4 ${statusConfig.iconClass}`} />
                            </div>
                          </div>
                          <div className="flex justify-between gap-4 pb-4 w-full">
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-semibold leading-none">{event.status}</p>
                              <p className="text-xs text-muted-foreground">{event.description}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span>{event.location}</span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground shrink-0">
                              <p>{event.date}</p>
                              <p>{event.time}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="details" className="mt-0 flex-1 overflow-y-auto pb-6">
              <div className="space-y-4 pt-4">
                <Card className="p-4">
                  <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Order Information
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order Number</span>
                      <span className="font-mono font-medium">#ORD-2025-1021</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Order Date</span>
                      <span className="font-medium">Oct 18, 2025</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Items</span>
                      <span className="font-medium">{orderItems.length} items</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold">$249.99</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Package Details
                  </h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Weight</span>
                      <span className="font-medium">2.5 lbs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dimensions</span>
                      <span className="font-medium">12 × 8 × 4 in</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Service Type</span>
                      <span className="font-medium">Express Shipping</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Delivery</span>
                      <span className="font-medium">Oct 21, 2025</span>
                    </div>
                  </div>
                </Card>

                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" className="w-full bg-transparent">
                    View Invoice
                  </Button>
                  <Button variant="outline" className="w-full bg-transparent">
                    Contact Support
                  </Button>
                  <Button className="w-full">Return or Exchange</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="delivery" className="mt-0 flex-1 overflow-y-auto pb-6">
              <div className="space-y-4 pt-4">
                <Card className="p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    Delivery Address
                  </h4>
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium">John Doe</p>
                    <p className="text-muted-foreground">123 Market Street</p>
                    <p className="text-muted-foreground">Apt 4B</p>
                    <p className="text-muted-foreground">San Francisco, CA 94103</p>
                    <p className="text-muted-foreground">United States</p>
                  </div>
                </Card>

                <Card className="p-4">
                  <h4 className="mb-3 text-sm font-semibold">Delivery Instructions</h4>
                  <p className="text-sm text-muted-foreground">
                    Please leave the package at the front door. Ring the doorbell upon delivery.
                  </p>
                </Card>

                <Card className="border-success/20 bg-success/5 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-foreground">Delivery Confirmed</h4>
                      <p className="text-sm text-muted-foreground">
                        Your package was successfully delivered to the front door on Oct 21, 2025 at 2:45 PM.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}