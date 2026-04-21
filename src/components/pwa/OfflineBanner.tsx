import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [showReturned, setShowReturned] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      setShowReturned(true)
      setTimeout(() => setShowReturned(false), 3000)
    }
    function handleOffline() {
      setOnline(false)
      setShowReturned(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online && !showReturned) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 text-center text-xs font-medium py-2 px-4 transition-colors duration-500 ${
        online ? 'bg-sage text-white' : 'bg-terracotta/90 text-white'
      }`}
    >
      {online ? '✓ Back online' : '⚡ Offline — showing cached content'}
    </div>
  )
}
