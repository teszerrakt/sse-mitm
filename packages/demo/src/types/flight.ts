export interface Airport {
  code: string
  name: string
  city: string
  country: string
}

export interface FlightClass {
  id: string
  name: string
  description: string
}

export interface Flight {
  id: string
  flightNumber: string
  airline: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  durationMinutes: number
  stops: number
  stopCities: string[]
  aircraft: string
  price: number
  currency: string
  cabinClass: string
  seatsAvailable: number
  source: string
}

export interface FareBreakdown {
  baseFare: number
  taxes: number
  fuelSurcharge: number
  serviceFee: number
  total: number
  currency: string
}

export interface BaggageAllowance {
  type: string
  weight: string
  included: boolean
  price: number | null
}

export interface SeatAvailability {
  cabin: string
  available: number
  total: number
}

export interface FlightInventory {
  flight: Flight
  fareBreakdown: FareBreakdown
  baggage: BaggageAllowance[]
  seatAvailability: SeatAvailability[]
  amenities: string[]
  cancellationPolicy: string
  changePolicy: string
}

/* SSE event types */

export interface SearchStartedEvent {
  totalSources: number
  query: SearchQuery
}

export interface SourceConnectedEvent {
  source: string
  index: number
}

export interface FlightFoundEvent {
  flight: Flight
}

export interface SourceCompleteEvent {
  source: string
  results: number
}

export interface SearchProgressEvent {
  progress: number
  sourcesDone: number
  sourcesTotal: number
}

export interface SearchCompleteEvent {
  totalResults: number
  searchTimeMs: number
}

export interface SearchQuery {
  origin: string
  destination: string
  date: string
  cabinClass: string
  passengers: number
}
