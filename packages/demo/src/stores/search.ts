import { create } from "zustand"
import type {
  Flight,
  SearchQuery,
  FlightInventory,
  SearchStartedEvent,
  SourceConnectedEvent,
  FlightFoundEvent,
  SourceCompleteEvent,
  SearchProgressEvent,
  SearchCompleteEvent,
} from "@/types/flight"

/* ── Source tracking ────────────────────────────────────────────────────────── */

export interface SourceStatus {
  name: string
  index: number
  status: "connecting" | "searching" | "complete"
  results: number
}

/* ── Store shape ────────────────────────────────────────────────────────────── */

interface SearchState {
  /* search */
  status: "idle" | "searching" | "complete" | "error"
  flights: Flight[]
  sources: SourceStatus[]
  progress: number
  totalResults: number
  searchTimeMs: number
  error: string | null
  query: SearchQuery | null

  /* detail panel */
  selectedFlightId: string | null
  inventory: FlightInventory | null
  inventoryLoading: boolean
}

interface SearchActions {
  search: (query: SearchQuery) => Promise<void>
  reset: () => void
  selectFlight: (flightId: string) => Promise<void>
  clearSelection: () => void
}

const INITIAL: SearchState = {
  status: "idle",
  flights: [],
  sources: [],
  progress: 0,
  totalResults: 0,
  searchTimeMs: 0,
  error: null,
  query: null,
  selectedFlightId: null,
  inventory: null,
  inventoryLoading: false,
}

/* keep a module-scoped abort controller so consecutive searches cancel prior */
let abortController: AbortController | null = null

export const useSearchStore = create<SearchState & SearchActions>()((set, get) => ({
  ...INITIAL,

  /* ── Search (SSE) ─────────────────────────────────────────── */

  search: async (query) => {
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller

    set({ ...INITIAL, status: "searching", query })

    try {
      const res = await fetch("/api/search/sse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`Search failed: ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        let currentEvent = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ") && currentEvent) {
            const data: unknown = JSON.parse(line.slice(6))
            processSSEEvent(currentEvent, data, set, get)
            currentEvent = ""
          }
        }
      }

      set({ status: "complete" })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      set({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  },

  reset: () => {
    abortController?.abort()
    set(INITIAL)
  },

  /* ── Detail (regular POST) ────────────────────────────────── */

  selectFlight: async (flightId) => {
    const { query } = get()
    if (!query) return

    set({ selectedFlightId: flightId, inventoryLoading: true, inventory: null })

    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flightId,
          origin: query.origin,
          destination: query.destination,
          date: query.date,
          cabinClass: query.cabinClass,
        }),
      })

      if (!res.ok) throw new Error(`Inventory failed: ${res.status}`)

      const inventory: FlightInventory = await res.json()
      set({ inventory, inventoryLoading: false })
    } catch {
      set({ inventoryLoading: false })
    }
  },

  clearSelection: () => {
    set({ selectedFlightId: null, inventory: null, inventoryLoading: false })
  },
}))

/* ── SSE event dispatcher ───────────────────────────────────────────────────── */

type Setter = (partial: Partial<SearchState>) => void
type Getter = () => SearchState & SearchActions

function processSSEEvent(event: string, data: unknown, set: Setter, _get: Getter) {
  switch (event) {
    case "search_started": {
      void (data as SearchStartedEvent)
      break
    }
    case "source_connected": {
      const e = data as SourceConnectedEvent
      set({
        sources: [
          ...useSearchStore.getState().sources,
          { name: e.source, index: e.index, status: "searching", results: 0 },
        ],
      })
      break
    }
    case "flight_found": {
      const e = data as FlightFoundEvent
      set({ flights: [...useSearchStore.getState().flights, e.flight] })
      break
    }
    case "source_complete": {
      const e = data as SourceCompleteEvent
      set({
        sources: useSearchStore.getState().sources.map((s) =>
          s.name === e.source ? { ...s, status: "complete" as const, results: e.results } : s,
        ),
      })
      break
    }
    case "search_progress": {
      const e = data as SearchProgressEvent
      set({ progress: e.progress })
      break
    }
    case "search_complete": {
      const e = data as SearchCompleteEvent
      set({ totalResults: e.totalResults, searchTimeMs: e.searchTimeMs })
      break
    }
  }
}
