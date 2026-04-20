export default function OverviewPage() {
  return (
    <div className="p-4 pt-6">
      <header className="mb-6">
        <img src="/logo-words.png" alt="WanderWisely" className="h-8 mb-1" />
        <h1 className="font-display text-2xl text-forest">Trip Overview</h1>
      </header>

      <div className="space-y-4">
        <div className="card">
          <p className="text-xs text-forest/50 uppercase tracking-wide mb-1">Trip</p>
          <p className="font-display text-xl text-forest">—</p>
          <p className="text-sm text-forest/60 mt-1">Dates TBD</p>
        </div>

        <div className="card">
          <p className="text-xs text-forest/50 uppercase tracking-wide mb-3">Budget Health</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-forest/50">Food cushion</p>
              <p className="font-mono text-lg text-sage">—</p>
            </div>
            <div>
              <p className="text-xs text-forest/50">Hotel</p>
              <p className="text-sm text-sage font-medium">—</p>
            </div>
            <div>
              <p className="text-xs text-forest/50">Car</p>
              <p className="font-mono text-lg text-forest">—</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
