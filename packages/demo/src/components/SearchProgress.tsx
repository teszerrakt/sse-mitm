import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useSearchStore } from "@/stores/search"
import type { SourceStatus } from "@/stores/search"

/* ── Context ────────────────────────────────────────────────────────────────── */

interface ProgressContext {
  status: "idle" | "searching" | "complete" | "error"
  progress: number
  sources: SourceStatus[]
  totalResults: number
  searchTimeMs: number
}

const Ctx = createContext<ProgressContext | null>(null)

function useProgressCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("SearchProgress.* must be used within <SearchProgress.Root>")
  return ctx
}

/* ── Root ────────────────────────────────────────────────────────────────────── */

function Root({ children, className }: { children: ReactNode; className?: string }) {
  const status = useSearchStore((s) => s.status)
  const progress = useSearchStore((s) => s.progress)
  const sources = useSearchStore((s) => s.sources)
  const totalResults = useSearchStore((s) => s.totalResults)
  const searchTimeMs = useSearchStore((s) => s.searchTimeMs)

  if (status === "idle") return null

  return (
    <Ctx.Provider value={{ status, progress, sources, totalResults, searchTimeMs }}>
      <div className={cn("space-y-3", className)}>{children}</div>
    </Ctx.Provider>
  )
}

/* ── Bar ─────────────────────────────────────────────────────────────────────── */

function Bar({ className }: { className?: string }) {
  const { status, progress, totalResults, searchTimeMs } = useProgressCtx()

  const label =
    status === "searching"
      ? `Searching... ${progress}%`
      : status === "complete"
        ? `Found ${totalResults} flights in ${(searchTimeMs / 1000).toFixed(1)}s`
        : status === "error"
          ? "Search failed"
          : ""

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {status === "searching" && (
          <Loader2 className="size-3 animate-spin text-primary" />
        )}
        {status === "complete" && (
          <CheckCircle2 className="size-3 text-success" />
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            status === "error" ? "bg-danger" : "bg-primary",
          )}
          style={{ width: `${status === "complete" ? 100 : progress}%` }}
        />
      </div>
    </div>
  )
}

/* ── Sources ─────────────────────────────────────────────────────────────────── */

function Sources({ className }: { className?: string }) {
  const { sources } = useProgressCtx()

  if (sources.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {sources.map((source) => (
        <SourcePill key={source.name} source={source} />
      ))}
    </div>
  )
}

function SourcePill({ source }: { source: SourceStatus }) {
  const isComplete = source.status === "complete"

  return (
    <Badge
      variant={isComplete ? "secondary" : "outline"}
      className={cn(
        "gap-1.5 px-2.5 py-1 text-xs transition-colors",
        isComplete
          ? "border-success/30 text-success"
          : "border-border text-muted-foreground",
      )}
    >
      {isComplete ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <Loader2 className="size-3 animate-spin" />
      )}
      {source.name}
      {isComplete && (
        <span className="ml-0.5 opacity-70">({source.results})</span>
      )}
    </Badge>
  )
}

/* ── Compound export ────────────────────────────────────────────────────────── */

export const SearchProgress = {
  Root,
  Bar,
  Sources,
}
