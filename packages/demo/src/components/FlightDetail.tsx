import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import {
  Plane,
  Clock,
  Luggage,
  Armchair,
  CheckCircle2,
  XCircle,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import { Badge } from "@/components/ui/badge"
import { cn, formatDuration, formatPrice } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSearchStore } from "@/stores/search"
import type { FlightInventory } from "@/types/flight"

/* ── Context ────────────────────────────────────────────────────────────────── */

const DetailCtx = createContext<FlightInventory | null>(null)

function useDetailCtx() {
  const ctx = useContext(DetailCtx)
  if (!ctx) throw new Error("FlightDetail.* must be used within <FlightDetail.Root>")
  return ctx
}

/* ── Root (Drawer on mobile, Dialog on desktop) ─────────────────────────────── */

function Root({ children }: { children: ReactNode }) {
  const selectedFlightId = useSearchStore((s) => s.selectedFlightId)
  const inventory = useSearchStore((s) => s.inventory)
  const inventoryLoading = useSearchStore((s) => s.inventoryLoading)
  const clearSelection = useSearchStore((s) => s.clearSelection)
  const isDesktop = useMediaQuery("(min-width: 640px)")

  const open = selectedFlightId !== null

  const loadingFallback = (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="mb-3 size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading flight details...</p>
    </div>
  )

  const content = inventoryLoading ? (
    loadingFallback
  ) : inventory ? (
    <DetailCtx.Provider value={inventory}>{children}</DetailCtx.Provider>
  ) : null

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && clearSelection()}>
        <DialogContent className="max-w-2xl border-border bg-panel max-h-[85vh] overflow-y-auto">
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && clearSelection()}>
      <DrawerContent className="border-border bg-panel">
        <div className="max-h-[85vh] overflow-y-auto px-4 pb-6">
          {content}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/* ── Header ─────────────────────────────────────────────────────────────────── */

function Header() {
  const { flight } = useDetailCtx()
  const isDesktop = useMediaQuery("(min-width: 640px)")

  const titleContent = (
    <span className="flex items-center gap-2 text-lg">
      <span className="font-mono">{flight.flightNumber}</span>
      <span className="text-muted-foreground font-normal">·</span>
      <span className="font-normal">{flight.airline}</span>
    </span>
  )

  const descContent = (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-mono">{flight.origin}</span>
      <Plane className="size-3 text-primary" />
      <span className="font-mono">{flight.destination}</span>
      <span className="text-muted-foreground">·</span>
      <span className="capitalize">{flight.cabinClass.replace("_", " ")}</span>
    </span>
  )

  if (isDesktop) {
    return (
      <DialogHeader>
        <DialogTitle asChild>{titleContent}</DialogTitle>
        <DialogDescription asChild>{descContent}</DialogDescription>
      </DialogHeader>
    )
  }

  return (
    <DrawerHeader className="px-0 text-left">
      <DrawerTitle asChild>{titleContent}</DrawerTitle>
      <DrawerDescription asChild>{descContent}</DrawerDescription>
    </DrawerHeader>
  )
}

/* ── RouteMap ───────────────────────────────────────────────────────────────── */

function RouteMap({ className }: { className?: string }) {
  const { flight } = useDetailCtx()

  return (
    <div className={cn("rounded-lg border border-border-subtle bg-elevated/50 p-3 sm:p-4", className)}>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="shrink-0 text-center">
          <div className="font-mono text-lg font-bold sm:text-xl">{flight.departureTime}</div>
          <div className="font-mono text-xs font-medium text-primary sm:text-sm">{flight.origin}</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            {formatDuration(flight.durationMinutes)}
          </div>
          <div className="relative flex w-full items-center">
            <div className="h-px flex-1 bg-border" />
            {flight.stops > 0 &&
              flight.stopCities.map((city) => (
                <div
                  key={city}
                  className="mx-1 flex flex-col items-center sm:mx-2"
                >
                  <div className="size-2 rounded-full bg-warning" />
                  <span className="mt-0.5 font-mono text-[10px] text-warning">{city}</span>
                </div>
              ))}
            <Plane className="mx-1 size-4 shrink-0 text-primary" />
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="text-xs text-muted-foreground">
            {flight.stops === 0 ? "Non-stop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}
          </div>
        </div>

        <div className="shrink-0 text-center">
          <div className="font-mono text-lg font-bold sm:text-xl">{flight.arrivalTime}</div>
          <div className="font-mono text-xs font-medium text-primary sm:text-sm">{flight.destination}</div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-dim">{flight.aircraft}</div>
    </div>
  )
}

/* ── FareBreakdown ──────────────────────────────────────────────────────────── */

function Fare({ className }: { className?: string }) {
  const { fareBreakdown } = useDetailCtx()

  const rows = [
    { label: "Base fare", amount: fareBreakdown.baseFare },
    { label: "Taxes & fees", amount: fareBreakdown.taxes },
    { label: "Fuel surcharge", amount: fareBreakdown.fuelSurcharge },
    { label: "Service fee", amount: fareBreakdown.serviceFee },
  ]

  return (
    <Section title="Fare Breakdown" icon={FileText} className={className}>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-mono">{formatPrice(row.amount, fareBreakdown.currency)}</span>
          </div>
        ))}
        <div className="border-t border-border-subtle pt-1.5 flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono text-primary">
            {formatPrice(fareBreakdown.total, fareBreakdown.currency)}
          </span>
        </div>
      </div>
    </Section>
  )
}

/* ── Baggage ────────────────────────────────────────────────────────────────── */

function Baggage({ className }: { className?: string }) {
  const { baggage } = useDetailCtx()

  return (
    <Section title="Baggage Allowance" icon={Luggage} className={className}>
      <div className="space-y-1.5">
        {baggage.map((b) => (
          <div key={b.type} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{b.type}</span>
              <span className="font-mono text-xs text-dim">{b.weight}</span>
            </div>
            {b.included ? (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3" /> Included
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <XCircle className="size-3" />{" "}
                {b.price !== null ? formatPrice(b.price) : "N/A"}
              </span>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── SeatAvailability ───────────────────────────────────────────────────────── */

function Seats({ className }: { className?: string }) {
  const { seatAvailability } = useDetailCtx()

  return (
    <Section title="Seat Availability" icon={Armchair} className={className}>
      <div className="space-y-2">
        {seatAvailability.map((s) => {
          const pct = Math.round((s.available / s.total) * 100)
          const color =
            pct > 50 ? "bg-success" : pct > 20 ? "bg-warning" : "bg-danger"

          return (
            <div key={s.cabin} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.cabin}</span>
                <span className="font-mono text-xs">
                  {s.available}/{s.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  className={cn("h-full rounded-full transition-all", color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/* ── Amenities ──────────────────────────────────────────────────────────────── */

function Amenities({ className }: { className?: string }) {
  const { amenities } = useDetailCtx()

  return (
    <Section title="Amenities" icon={Sparkles} className={className}>
      <div className="flex flex-wrap gap-1.5">
        {amenities.map((a) => (
          <Badge key={a} variant="secondary" className="text-xs">
            {a}
          </Badge>
        ))}
      </div>
    </Section>
  )
}

/* ── Policies ───────────────────────────────────────────────────────────────── */

function Policies({ className }: { className?: string }) {
  const { cancellationPolicy, changePolicy } = useDetailCtx()

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      <div>
        <span className="text-muted-foreground">Cancellation: </span>
        <span>{cancellationPolicy}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Changes: </span>
        <span>{changePolicy}</span>
      </div>
    </div>
  )
}

/* ── Shared Section layout ──────────────────────────────────────────────────── */

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </h3>
      {children}
    </div>
  )
}

/* ── Compound export ────────────────────────────────────────────────────────── */

export const FlightDetail = {
  Root,
  Header,
  RouteMap,
  Fare,
  Baggage,
  Seats,
  Amenities,
  Policies,
}
