import { Plane } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSearchStore } from "@/stores/search"
import { FlightCard } from "@/components/FlightCard"

export function FlightList({ className }: { className?: string }) {
  const flights = useSearchStore((s) => s.flights)
  const status = useSearchStore((s) => s.status)

  if (status === "idle") return null

  if (flights.length === 0 && status === "searching") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-muted-foreground", className)}>
        <Plane className="mb-3 size-8 animate-pulse text-primary" />
        <p className="text-sm">Searching for flights...</p>
      </div>
    )
  }

  if (status === "complete" && flights.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-muted-foreground", className)}>
        <p className="text-sm">No flights found for this route.</p>
      </div>
    )
  }

  if (status === "error") {
    const error = useSearchStore.getState().error
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 text-danger", className)}>
        <p className="text-sm">Search failed: {error}</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {flights.length} flight{flights.length !== 1 ? "s" : ""} found
        </span>
        {status === "searching" && (
          <span className="animate-pulse-dot">More results incoming...</span>
        )}
      </div>

      <div className="space-y-3">
        {flights.map((flight, i) => (
          <FlightCard.Root key={flight.id} flight={flight} index={i}>
            <FlightCard.Route />
            <FlightCard.Info />
            <FlightCard.Footer />
          </FlightCard.Root>
        ))}
      </div>
    </div>
  )
}
