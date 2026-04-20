export default function BudgetPage() {
  return (
    <div className="p-4 pt-6">
      <h1 className="font-display text-2xl text-forest mb-4">Budget</h1>

      <div className="space-y-4">
        <div className="card">
          <p className="font-medium text-forest mb-1">🍽️ Food</p>
          <p className="text-forest/50 text-sm">Set up your food budget in Settings.</p>
        </div>

        <div className="card">
          <p className="font-medium text-forest mb-1">🏨 Hotel</p>
          <p className="text-forest/50 text-sm">Set up lodging budget in Settings.</p>
        </div>

        <div className="card">
          <p className="font-medium text-forest mb-1">🚗 Car / Gas</p>
          <p className="text-forest/50 text-sm">Set up car budget in Settings.</p>
        </div>
      </div>
    </div>
  )
}
