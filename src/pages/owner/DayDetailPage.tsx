import { useParams } from 'react-router-dom'

export default function DayDetailPage() {
  const { dayId } = useParams()

  return (
    <div className="p-4 pt-6">
      <h1 className="font-display text-2xl text-forest mb-4">Day Detail</h1>
      <p className="text-forest/50 text-sm">Day ID: {dayId}</p>
    </div>
  )
}
