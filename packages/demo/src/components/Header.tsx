import { Plane } from "lucide-react"

export function Header() {
  return (
    <header className="shrink-0 border-b border-border bg-panel/50 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Plane className="size-4 text-primary" />
          </div>
          <span className="text-lg font-semibold tracking-tight">SkySearch</span>
        </div>
      </div>
    </header>
  )
}
