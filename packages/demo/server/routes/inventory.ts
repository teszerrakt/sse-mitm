import { Hono } from "hono"
import { generateFlightsForSource, generateInventory, pickSources } from "../data"

const inventory = new Hono()

inventory.post("/", async (c) => {
  const body = await c.req.json<{
    flightId: string
    origin: string
    destination: string
    date: string
    cabinClass: string
  }>()

  const { flightId, origin, destination, date, cabinClass } = body

  // Reconstruct the flight from the same seed-based generation
  const sources = pickSources(origin, destination, date)
  for (const source of sources) {
    const flights = generateFlightsForSource(source, origin, destination, date, cabinClass)
    const found = flights.find((f) => f.id === flightId)
    if (found) {
      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500))
      return c.json(generateInventory(flightId, found))
    }
  }

  return c.json({ error: "Flight not found" }, 404)
})

export { inventory }
