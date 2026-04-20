export default function WalletPage() {
  return (
    <div className="p-4 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Wallet</h1>
        <button className="btn-primary">+ Add</button>
      </div>
      <div className="card text-center text-forest/50 py-12">
        <p className="text-sm">No reservations yet.</p>
        <p className="text-xs mt-1">Tap + to paste a confirmation email.</p>
      </div>
    </div>
  )
}
