import { Hono } from "hono"
import { cors } from "hono/cors"
import { airports } from "./routes/airports"
import { classes } from "./routes/classes"
import { search } from "./routes/search"
import { inventory } from "./routes/inventory"

const app = new Hono()

app.use("/*", cors())

app.route("/api/airports", airports)
app.route("/api/classes", classes)
app.route("/api/search/sse", search)
app.route("/api/inventory", inventory)

console.log("[demo-server] Starting on http://localhost:3001")

export default {
  port: 3001,
  fetch: app.fetch,
}
