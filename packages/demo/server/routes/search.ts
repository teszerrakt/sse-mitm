import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { pickSources, generateFlightsForSource } from "../data"

const search = new Hono()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(min: number, max: number): Promise<void> {
  return delay(min + Math.random() * (max - min))
}

search.post("/", async (c) => {
  const body = await c.req.json<{
    origin: string
    destination: string
    date: string
    cabinClass: string
    passengers: number
  }>()

  const { origin, destination, date, cabinClass, passengers } = body
  const sources = pickSources(origin, destination, date)

  return streamSSE(c, async (stream) => {
    const startTime = Date.now()
    let totalResults = 0
    let eventId = 0

    // search_started
    await stream.writeSSE({
      event: "search_started",
      data: JSON.stringify({
        totalSources: sources.length,
        query: { origin, destination, date, cabinClass, passengers },
      }),
      id: String(eventId++),
    })

    await randomDelay(300, 600)

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]

      // source_connected
      await stream.writeSSE({
        event: "source_connected",
        data: JSON.stringify({ source, index: i + 1 }),
        id: String(eventId++),
      })

      await randomDelay(400, 1200)

      // Generate flights for this source
      const flights = generateFlightsForSource(source, origin, destination, date, cabinClass)

      // Stream each flight with a small delay
      for (const flight of flights) {
        await stream.writeSSE({
          event: "flight_found",
          data: JSON.stringify({ flight }),
          id: String(eventId++),
        })
        totalResults++
        await randomDelay(200, 800)
      }

      // source_complete
      await stream.writeSSE({
        event: "source_complete",
        data: JSON.stringify({ source, results: flights.length }),
        id: String(eventId++),
      })

      // search_progress
      const progress = Math.round(((i + 1) / sources.length) * 100)
      await stream.writeSSE({
        event: "search_progress",
        data: JSON.stringify({
          progress,
          sourcesDone: i + 1,
          sourcesTotal: sources.length,
        }),
        id: String(eventId++),
      })

      await randomDelay(200, 500)
    }

    // search_complete
    await stream.writeSSE({
      event: "search_complete",
      data: JSON.stringify({
        totalResults,
        searchTimeMs: Date.now() - startTime,
      }),
      id: String(eventId++),
    })
  })
})

export { search }
