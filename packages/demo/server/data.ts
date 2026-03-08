import { faker } from "@faker-js/faker"
import type { Airport, Flight, FlightClass, FlightInventory } from "../src/types/flight"

/* ── Static airport list (seeded once) ──────────────────────────────────────── */

const AIRPORTS: Airport[] = [
  { code: "SIN", name: "Changi Airport", city: "Singapore", country: "Singapore" },
  { code: "NRT", name: "Narita International", city: "Tokyo", country: "Japan" },
  { code: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan" },
  { code: "ICN", name: "Incheon International", city: "Seoul", country: "South Korea" },
  { code: "HKG", name: "Hong Kong International", city: "Hong Kong", country: "China" },
  { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand" },
  { code: "KUL", name: "Kuala Lumpur International", city: "Kuala Lumpur", country: "Malaysia" },
  { code: "CGK", name: "Soekarno-Hatta International", city: "Jakarta", country: "Indonesia" },
  { code: "MNL", name: "Ninoy Aquino International", city: "Manila", country: "Philippines" },
  { code: "DEL", name: "Indira Gandhi International", city: "New Delhi", country: "India" },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj", city: "Mumbai", country: "India" },
  { code: "SYD", name: "Sydney Kingsford Smith", city: "Sydney", country: "Australia" },
  { code: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia" },
  { code: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "United States" },
  { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "United States" },
  { code: "JFK", name: "John F. Kennedy International", city: "New York", country: "United States" },
  { code: "LHR", name: "Heathrow Airport", city: "London", country: "United Kingdom" },
  { code: "CDG", name: "Charles de Gaulle Airport", city: "Paris", country: "France" },
  { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany" },
  { code: "AMS", name: "Schiphol Airport", city: "Amsterdam", country: "Netherlands" },
  { code: "DXB", name: "Dubai International", city: "Dubai", country: "United Arab Emirates" },
  { code: "DOH", name: "Hamad International", city: "Doha", country: "Qatar" },
  { code: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Turkey" },
  { code: "TPE", name: "Taoyuan International", city: "Taipei", country: "Taiwan" },
  { code: "PVG", name: "Pudong International", city: "Shanghai", country: "China" },
  { code: "PEK", name: "Beijing Capital International", city: "Beijing", country: "China" },
  { code: "CTS", name: "New Chitose Airport", city: "Sapporo", country: "Japan" },
  { code: "KIX", name: "Kansai International", city: "Osaka", country: "Japan" },
  { code: "FCO", name: "Leonardo da Vinci Airport", city: "Rome", country: "Italy" },
  { code: "BCN", name: "Barcelona-El Prat Airport", city: "Barcelona", country: "Spain" },
  { code: "ZRH", name: "Zurich Airport", city: "Zurich", country: "Switzerland" },
  { code: "MUC", name: "Munich Airport", city: "Munich", country: "Germany" },
  { code: "YVR", name: "Vancouver International", city: "Vancouver", country: "Canada" },
  { code: "YYZ", name: "Toronto Pearson International", city: "Toronto", country: "Canada" },
  { code: "GRU", name: "Guarulhos International", city: "Sao Paulo", country: "Brazil" },
  { code: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", country: "Argentina" },
  { code: "JNB", name: "O.R. Tambo International", city: "Johannesburg", country: "South Africa" },
  { code: "CPT", name: "Cape Town International", city: "Cape Town", country: "South Africa" },
  { code: "AKL", name: "Auckland Airport", city: "Auckland", country: "New Zealand" },
  { code: "HAN", name: "Noi Bai International", city: "Hanoi", country: "Vietnam" },
  { code: "SGN", name: "Tan Son Nhat International", city: "Ho Chi Minh City", country: "Vietnam" },
  { code: "RGN", name: "Yangon International", city: "Yangon", country: "Myanmar" },
  { code: "CMB", name: "Bandaranaike International", city: "Colombo", country: "Sri Lanka" },
  { code: "DAD", name: "Da Nang International", city: "Da Nang", country: "Vietnam" },
  { code: "CEB", name: "Mactan-Cebu International", city: "Cebu", country: "Philippines" },
]

const CLASSES: FlightClass[] = [
  { id: "economy", name: "Economy", description: "Standard seating with complimentary snacks" },
  { id: "premium_economy", name: "Premium Economy", description: "Extra legroom and enhanced meal service" },
  { id: "business", name: "Business", description: "Lie-flat seats with premium dining and lounge access" },
  { id: "first", name: "First", description: "Private suites with personal butler service" },
]

const AIRLINES = [
  "SkyWing Airlines",
  "AeroConnect",
  "PacificAir",
  "Horizon Airways",
  "Atlas Global",
  "Zenith Airlines",
  "Meridian Air",
  "Compass Aviation",
]

const AIRLINE_CODES: Record<string, string> = {
  "SkyWing Airlines": "SW",
  AeroConnect: "AC",
  PacificAir: "PA",
  "Horizon Airways": "HA",
  "Atlas Global": "AG",
  "Zenith Airlines": "ZA",
  "Meridian Air": "MA",
  "Compass Aviation": "CA",
}

const AIRCRAFT = [
  "Boeing 787-9 Dreamliner",
  "Airbus A350-900",
  "Boeing 777-300ER",
  "Airbus A380-800",
  "Boeing 737 MAX 8",
  "Airbus A321neo",
  "Boeing 767-300ER",
  "Airbus A330-300",
]

const AMENITIES_POOL = [
  "In-flight WiFi",
  "Personal entertainment screen",
  "USB charging port",
  "AC power outlet",
  "Blanket and pillow",
  "Complimentary meals",
  "Premium meal selection",
  "Noise-cancelling headphones",
  "Priority boarding",
  "Lounge access",
  "Lie-flat seat",
  "Amenity kit",
  "Turn-down service",
  "Pajamas provided",
  "Champagne service",
  "Chef-curated menu",
]

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function generateFlightNumber(airline: string): string {
  const code = AIRLINE_CODES[airline] ?? "XX"
  return `${code} ${faker.number.int({ min: 100, max: 999 })}`
}

function classMultiplier(cabinClass: string): number {
  switch (cabinClass) {
    case "premium_economy":
      return 1.6
    case "business":
      return 3.2
    case "first":
      return 5.5
    default:
      return 1
  }
}

/* ── Public API ─────────────────────────────────────────────────────────────── */

export function getAirports(): Airport[] {
  return AIRPORTS
}

export function getClasses(): FlightClass[] {
  return CLASSES
}

/**
 * Pick which sources (airlines) will appear in this search.
 * Seeded by the search query for deterministic results.
 */
export function pickSources(origin: string, destination: string, date: string): string[] {
  const seed = hashString(`${origin}-${destination}-${date}`)
  const seeded = faker.seed(seed)
  void seeded
  const count = faker.number.int({ min: 3, max: 5 })
  return faker.helpers.arrayElements(AIRLINES, count)
}

/**
 * Generate flights for a single source (airline).
 */
export function generateFlightsForSource(
  source: string,
  origin: string,
  destination: string,
  date: string,
  cabinClass: string,
): Flight[] {
  const seed = hashString(`${source}-${origin}-${destination}-${date}-${cabinClass}`)
  faker.seed(seed)

  const count = faker.number.int({ min: 1, max: 4 })
  const flights: Flight[] = []

  for (let i = 0; i < count; i++) {
    const depHour = faker.number.int({ min: 0, max: 22 })
    const depMin = faker.helpers.arrayElement([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
    const duration = faker.number.int({ min: 90, max: 960 })
    const totalMin = depHour * 60 + depMin + duration
    const arrHour = Math.floor(totalMin / 60) % 24
    const arrMin = totalMin % 60

    const stops = faker.helpers.weightedArrayElement([
      { value: 0, weight: 5 },
      { value: 1, weight: 3 },
      { value: 2, weight: 1 },
    ])

    const stopCities =
      stops > 0
        ? faker.helpers
            .arrayElements(
              AIRPORTS.filter((a) => a.code !== origin && a.code !== destination),
              stops,
            )
            .map((a) => a.code)
        : []

    const basePrice = faker.number.int({ min: 180, max: 1200 })
    const price = Math.round(basePrice * classMultiplier(cabinClass))

    flights.push({
      id: faker.string.uuid(),
      flightNumber: generateFlightNumber(source),
      airline: source,
      origin,
      destination,
      departureTime: formatTime(depHour, depMin),
      arrivalTime: formatTime(arrHour, arrMin),
      durationMinutes: duration,
      stops,
      stopCities,
      aircraft: faker.helpers.arrayElement(AIRCRAFT),
      price,
      currency: "USD",
      cabinClass,
      seatsAvailable: faker.number.int({ min: 1, max: 42 }),
      source,
    })
  }

  return flights
}

/**
 * Generate full inventory details for a flight.
 */
export function generateInventory(flightId: string, flight: Flight): FlightInventory {
  faker.seed(hashString(flightId))

  const baseFare = Math.round(flight.price * 0.78)
  const taxes = Math.round(flight.price * 0.12)
  const fuelSurcharge = Math.round(flight.price * 0.07)
  const serviceFee = flight.price - baseFare - taxes - fuelSurcharge

  const amenityCount =
    flight.cabinClass === "first"
      ? 10
      : flight.cabinClass === "business"
        ? 7
        : flight.cabinClass === "premium_economy"
          ? 5
          : 3

  return {
    flight,
    fareBreakdown: {
      baseFare,
      taxes,
      fuelSurcharge,
      serviceFee,
      total: flight.price,
      currency: flight.currency,
    },
    baggage: [
      { type: "Carry-on", weight: "7 kg", included: true, price: null },
      { type: "Checked bag", weight: "23 kg", included: flight.cabinClass !== "economy", price: flight.cabinClass === "economy" ? 35 : null },
      { type: "Extra bag", weight: "23 kg", included: false, price: 55 },
    ],
    seatAvailability: [
      { cabin: "Economy", available: faker.number.int({ min: 40, max: 156 }), total: 156 },
      { cabin: "Premium Economy", available: faker.number.int({ min: 5, max: 28 }), total: 28 },
      { cabin: "Business", available: faker.number.int({ min: 2, max: 36 }), total: 36 },
      { cabin: "First", available: faker.number.int({ min: 0, max: 8 }), total: 8 },
    ],
    amenities: faker.helpers.arrayElements(AMENITIES_POOL, amenityCount),
    cancellationPolicy: faker.helpers.arrayElement([
      "Free cancellation within 24 hours of booking",
      "Non-refundable — credit voucher available for $75 fee",
      "Full refund up to 7 days before departure",
      "50% refund up to 48 hours before departure",
    ]),
    changePolicy: faker.helpers.arrayElement([
      "Free date change up to 3 days before departure",
      "Date change available for $50 fee",
      "One free change permitted; additional changes $75 each",
      "No changes permitted on this fare",
    ]),
  }
}

/* ── Internal ───────────────────────────────────────────────────────────────── */

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash)
}
