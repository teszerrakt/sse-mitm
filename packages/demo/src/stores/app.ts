import { create } from "zustand"
import type { Airport, FlightClass } from "@/types/flight"

interface AppState {
  airports: Airport[]
  classes: FlightClass[]
  loaded: boolean
}

interface AppActions {
  fetchAirports: () => Promise<void>
  fetchClasses: () => Promise<void>
  init: () => Promise<void>
}

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  airports: [],
  classes: [],
  loaded: false,

  fetchAirports: async () => {
    const res = await fetch("/api/airports")
    const airports: Airport[] = await res.json()
    set({ airports })
  },

  fetchClasses: async () => {
    const res = await fetch("/api/classes")
    const classes: FlightClass[] = await res.json()
    set({ classes })
  },

  init: async () => {
    if (get().loaded) return
    await Promise.all([get().fetchAirports(), get().fetchClasses()])
    set({ loaded: true })
  },
}))
