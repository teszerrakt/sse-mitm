import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { Clock, Plane } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn, formatDuration, formatPrice } from "@/lib/utils"
import { useSearchStore } from "@/stores/search"
import type { Flight } from "@/types/flight"

/* ── Context ────────────────────────────────────────────────────────────────── */

const FlightCtx = createContext<Flight | null>(null)

function useFlightCtx() {
  const ctx = useContext(FlightCtx)
  if (!ctx) throw new Error("FlightCard.* must be used within <FlightCard.Root>")
  return ctx
}

/* ── Root ────────────────────────────────────────────────────────────────────── */

function Root({
  flight,
  index,
  children,
  className,
}: {
  flight: Flight
  index: number
  children: ReactNode
  className?: string
}) {
  return (
    <FlightCtx.Provider value={flight}>
      <div
        className={cn(
          "animate-slide-up rounded-xl border border-border bg-panel transition-colors hover:border-primary/30",
          className,
        )}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {children}
      </div>
    </FlightCtx.Provider>
  )
}

/* ── Route (Booking.com style: time ── badge ── time) ──────────────────────── */

function Route({ className }: { className?: string }) {
  const flight = useFlightCtx()

  const stopLabel =
    flight.stops === 0
      ? "Direct"
      : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`

  return (
    <div className={cn("flex items-center gap-2 px-4 pt-4 sm:gap-3", className)}>
      {/* Departure */}
      <div className="shrink-0 text-right">
        <div className="font-mono text-lg font-bold leading-tight sm:text-xl">
          {flight.departureTime}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {flight.origin}
        </div>
      </div>

      {/* Route line with stop badge */}
      <div className="flex min-w-0 flex-1 flex-col items-center">
        <div className="relative flex w-full items-center">
          <div className="h-px flex-1 bg-border" />
          <div className="size-1.5 rounded-full bg-muted-foreground" />
          <div className="h-px flex-1 bg-border" />
          <Badge
            variant={flight.stops === 0 ? "secondary" : "outline"}
            className={cn(
              "mx-1 shrink-0 px-2 py-0.5 text-[11px] font-medium",
              flight.stops === 0 ? "text-success" : "text-warning",
            )}
          >
            {stopLabel}
          </Badge>
          <div className="h-px flex-1 bg-border" />
          <div className="size-1.5 rounded-full bg-muted-foreground" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {formatDuration(flight.durationMinutes)}
          {flight.stopCities.length > 0 && (
            <span className="ml-1 truncate">
              via {flight.stopCities.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Arrival */}
      <div className="shrink-0 text-left">
        <div className="font-mono text-lg font-bold leading-tight sm:text-xl">
          {flight.arrivalTime}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {flight.destination}
        </div>
      </div>
    </div>
  )
}

/* ── Info (airline + source + aircraft) ─────────────────────────────────────── */

function Info({ className }: { className?: string }) {
  const flight = useFlightCtx()

  return (
    <div className={cn("flex items-center gap-2 px-4 pt-2 text-sm", className)}>
      <Plane className="size-3.5 shrink-0 text-primary" />
      <span className="font-medium">{flight.airline}</span>
      <span className="font-mono text-xs text-muted-foreground">{flight.flightNumber}</span>
      <span className="text-dim">·</span>
      <span className="text-xs text-dim">{flight.aircraft}</span>
      <div className="flex-1" />
      <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
        {flight.source}
      </Badge>
    </div>
  )
}

/* ── Footer (price + badges + View details button) ──────────────────────────── */

function Footer({ className }: { className?: string }) {
  const flight = useFlightCtx()
  const selectFlight = useSearchStore((s) => s.selectFlight)

  const priceColor =
    flight.price < 400
      ? "text-success"
      : flight.price < 800
        ? "text-foreground"
        : "text-warning"

  return (
    <div className={cn("px-4 pb-4 pt-3", className)}>
      {/* Price row */}
      <div className="flex items-end justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs capitalize">
            {flight.cabinClass.replace("_", " ")}
          </Badge>
          {flight.seatsAvailable <= 5 && (
            <Badge variant="destructive" className="text-xs">
              {flight.seatsAvailable} left
            </Badge>
          )}
        </div>
        <div className="text-right">
          <div className={cn("font-mono text-xl font-bold leading-tight", priceColor)}>
            {formatPrice(flight.price, flight.currency)}
          </div>
        </div>
      </div>

      {/* Full-width View details button */}
      <Button
        variant="outline"
        className="mt-3 h-10 w-full border-primary/40 text-primary hover:bg-primary/10"
        onClick={() => selectFlight(flight.id)}
      >
        View details
      </Button>
    </div>
  )
}

/* ── Compound export ────────────────────────────────────────────────────────── */

export const FlightCard = {
  Root,
  Route,
  Info,
  Footer,
}
