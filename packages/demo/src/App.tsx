import { Header } from "@/components/Header"
import { SearchForm, useInitApp } from "@/components/SearchForm"
import { SearchProgress } from "@/components/SearchProgress"
import { FlightList } from "@/components/FlightList"
import { FlightDetail } from "@/components/FlightDetail"

export function App() {
  useInitApp()

  return (
    <div className="flex h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* ── Search form (Booking.com stacked rows) ──────── */}
        <SearchForm.Root>
          <SearchForm.AirportPair />
          <SearchForm.DatePicker />
          <SearchForm.TravellerClass />
          <SearchForm.SubmitButton />
        </SearchForm.Root>

        {/* ── Progress ─────────────────────────────────────── */}
        <SearchProgress.Root>
          <SearchProgress.Bar />
          <SearchProgress.Sources />
        </SearchProgress.Root>

        {/* ── Results ──────────────────────────────────────── */}
        <FlightList />

        {/* ── Detail (drawer on mobile, dialog on desktop) ── */}
        <FlightDetail.Root>
          <div className="space-y-4 sm:space-y-5">
            <FlightDetail.Header />
            <FlightDetail.RouteMap />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FlightDetail.Fare />
              <FlightDetail.Baggage />
            </div>
            <FlightDetail.Seats />
            <FlightDetail.Amenities />
            <FlightDetail.Policies />
          </div>
        </FlightDetail.Root>
      </main>
    </div>
  )
}

export default App
