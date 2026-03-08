import { createContext, useContext, useState, useCallback, useEffect } from "react"
import type { ReactNode } from "react"
import { Plane, ArrowUpDown, Search, Users, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { useSearchStore } from "@/stores/search"
import type { SearchQuery } from "@/types/flight"

/* ── Context ────────────────────────────────────────────────────────────────── */

interface SearchFormContext {
  origin: string
  destination: string
  date: string
  cabinClass: string
  passengers: number
  setOrigin: (v: string) => void
  setDestination: (v: string) => void
  setDate: (v: string) => void
  setCabinClass: (v: string) => void
  setPassengers: (v: number) => void
  swap: () => void
  submit: () => void
  isSearching: boolean
}

const Ctx = createContext<SearchFormContext | null>(null)

function useSearchFormCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("SearchForm.* must be used within <SearchForm.Root>")
  return ctx
}

/* ── Root ────────────────────────────────────────────────────────────────────── */

function Root({ children, className }: { children: ReactNode; className?: string }) {
  const [origin, setOrigin] = useState("SIN")
  const [destination, setDestination] = useState("NRT")
  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split("T")[0]
  })
  const [cabinClass, setCabinClass] = useState("economy")
  const [passengers, setPassengers] = useState(1)

  const status = useSearchStore((s) => s.status)
  const search = useSearchStore((s) => s.search)
  const isSearching = status === "searching"

  const swap = useCallback(() => {
    setOrigin(destination)
    setDestination(origin)
  }, [origin, destination])

  const submit = useCallback(() => {
    if (isSearching) return
    const query: SearchQuery = {
      origin,
      destination,
      date,
      cabinClass,
      passengers,
    }
    search(query)
  }, [origin, destination, date, cabinClass, passengers, isSearching, search])

  return (
    <Ctx.Provider
      value={{
        origin,
        destination,
        date,
        cabinClass,
        passengers,
        setOrigin,
        setDestination,
        setDate,
        setCabinClass,
        setPassengers,
        swap,
        submit,
        isSearching,
      }}
    >
      <form
        className={cn("space-y-3", className)}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {children}
      </form>
    </Ctx.Provider>
  )
}

/* ── AirportPair (grouped card like Booking.com) ───────────────────────────── */

function AirportNameOrShimmer({ name }: { name: string | undefined }) {
  if (name) {
    return <span className="truncate text-sm text-muted-foreground">{name}</span>
  }
  return <span className="inline-block h-4 w-28 animate-shimmer rounded" />
}

function AirportPair({ className }: { className?: string }) {
  const { origin, destination, setOrigin, setDestination, swap } = useSearchFormCtx()
  const airports = useAppStore((s) => s.airports)
  const loaded = useAppStore((s) => s.loaded)

  const getAirport = (code: string) => airports.find((a) => a.code === code)
  const fromAirport = getAirport(origin)
  const toAirport = getAirport(destination)

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="divide-y divide-border-subtle rounded-xl border border-border bg-panel">
        {/* From row — pr-14 reserves space for floating swap button */}
        <div className="flex items-center gap-3 overflow-hidden px-4 pr-14 py-3.5">
          <Plane className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="text-xs text-muted-foreground">Flying from</div>
            {loaded ? (
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="h-auto w-full border-0 bg-transparent p-0 text-base font-medium shadow-none focus:ring-0 [&>svg]:hidden">
                  <SelectValue>
                    <span className="flex items-baseline gap-2 overflow-hidden">
                      <span className="shrink-0 font-mono font-semibold">{origin}</span>
                      <AirportNameOrShimmer name={fromAirport?.name} />
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {airports.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      <span className="font-mono font-medium">{a.code}</span>
                      <span className="ml-2 text-muted-foreground">{a.city}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-6 items-baseline gap-2">
                <span className="shrink-0 font-mono text-base font-semibold">{origin}</span>
                <AirportNameOrShimmer name={undefined} />
              </div>
            )}
          </div>
        </div>

        {/* To row — pr-14 reserves space for floating swap button */}
        <div className="flex items-center gap-3 overflow-hidden px-4 pr-14 py-3.5">
          <Plane className="size-5 shrink-0 rotate-90 text-muted-foreground" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="text-xs text-muted-foreground">Going to</div>
            {loaded ? (
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger className="h-auto w-full border-0 bg-transparent p-0 text-base font-medium shadow-none focus:ring-0 [&>svg]:hidden">
                  <SelectValue>
                    <span className="flex items-baseline gap-2 overflow-hidden">
                      <span className="shrink-0 font-mono font-semibold">{destination}</span>
                      <AirportNameOrShimmer name={toAirport?.name} />
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {airports.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      <span className="font-mono font-medium">{a.code}</span>
                      <span className="ml-2 text-muted-foreground">{a.city}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-6 items-baseline gap-2">
                <span className="shrink-0 font-mono text-base font-semibold">{destination}</span>
                <AirportNameOrShimmer name={undefined} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating swap button on the right edge (Booking.com style) */}
      <button
        type="button"
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 flex size-9 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        onClick={swap}
      >
        <ArrowUpDown className="size-4" />
      </button>
    </div>
  )
}

/* ── DatePicker (card row) ──────────────────────────────────────────────────── */

function DatePicker({ className }: { className?: string }) {
  const { date, setDate } = useSearchFormCtx()

  const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3.5",
        className,
      )}
    >
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">Departure date</div>
        <div className="relative">
          <div className="text-base font-medium">{formatted}</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
      </div>
    </div>
  )
}

/* ── TravellerClass (combined row like Booking.com "1 traveller, Economy") ── */

function TravellerClass({ className }: { className?: string }) {
  const { passengers, setPassengers, cabinClass, setCabinClass } = useSearchFormCtx()
  const classes = useAppStore((s) => s.classes)
  const loaded = useAppStore((s) => s.loaded)
  const classObj = classes.find((c) => c.id === cabinClass)

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3.5",
        className,
      )}
    >
      <Users className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">Travellers & class</div>
        <div className="flex h-7 items-center gap-3">
          {/* Passenger stepper */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md border border-border-subtle text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
              onClick={() => setPassengers(Math.max(1, passengers - 1))}
              disabled={passengers <= 1}
            >
              -
            </button>
            <span className="w-6 text-center font-mono text-base font-medium">{passengers}</span>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md border border-border-subtle text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
              onClick={() => setPassengers(Math.min(9, passengers + 1))}
              disabled={passengers >= 9}
            >
              +
            </button>
          </div>

          <span className="text-dim">·</span>

          {/* Class selector */}
          {loaded ? (
            <Select value={cabinClass} onValueChange={setCabinClass}>
              <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-base font-medium shadow-none focus:ring-0">
                <SelectValue>
                  {classObj?.name ?? cabinClass}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="inline-block h-4 w-20 animate-shimmer rounded" />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── SubmitButton ───────────────────────────────────────────────────────────── */

function SubmitButton({ className }: { className?: string }) {
  const { isSearching } = useSearchFormCtx()

  return (
    <Button
      type="submit"
      disabled={isSearching}
      className={cn(
        "h-12 w-full gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90",
        isSearching && "animate-pulse",
        className,
      )}
    >
      <Search className="size-5" />
      {isSearching ? "Searching..." : "Search Flights"}
    </Button>
  )
}

/* ── Init hook ──────────────────────────────────────────────────────────────── */

export function useInitApp() {
  const init = useAppStore((s) => s.init)
  useEffect(() => {
    init()
  }, [init])
}

/* ── Compound export ────────────────────────────────────────────────────────── */

export const SearchForm = {
  Root,
  AirportPair,
  DatePicker,
  TravellerClass,
  SubmitButton,
}
