import { Hono } from "hono"
import { getAirports } from "../data"

const airports = new Hono()

airports.get("/", (c) => {
  return c.json(getAirports())
})

export { airports }
