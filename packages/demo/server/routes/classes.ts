import { Hono } from "hono"
import { getClasses } from "../data"

const classes = new Hono()

classes.get("/", (c) => {
  return c.json(getClasses())
})

export { classes }
