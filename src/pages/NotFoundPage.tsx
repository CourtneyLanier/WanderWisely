import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6 text-center">
      <p className="text-6xl mb-4">🗺️</p>
      <h1 className="font-display text-3xl text-forest mb-2">Lost on the trail</h1>
      <p className="text-forest/60 text-sm mb-6">That page doesn't exist.</p>
      <Link to="/" className="btn-primary">Head home</Link>
    </div>
  )
}
