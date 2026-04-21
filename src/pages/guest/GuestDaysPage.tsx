import { useParams } from 'react-router-dom'

export default function GuestDaysPage() {
  const { shareCode } = useParams()

  return (
    <div className="p-4 pt-6">
      <h1 className="font-display text-2xl text-forest mb-4">Itinerary</h1>
      <p className="text-forest/40 text-xs mb-4">Trip code: {shareCode}</p>
      <div className="card text-center text-forest/50 py-12">
        <p className="text-sm">Loading itinerary…</p>
      </div>
    </div>
  )
}
