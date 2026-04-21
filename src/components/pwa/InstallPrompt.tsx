import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'ww-install-dismissed'

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function InstallPrompt() {
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone()) return
    if (localStorage.getItem(DISMISSED_KEY)) return

    if (isIOS()) {
      // Show iOS instructions after a short delay so it doesn't flash on load
      const t = setTimeout(() => setShowIOS(true), 2000)
      return () => clearTimeout(t)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setNativePrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Animate in when either prompt type becomes available
  useEffect(() => {
    if (nativePrompt || showIOS) {
      const t = setTimeout(() => setVisible(true), 100)
      return () => clearTimeout(t)
    }
  }, [nativePrompt, showIOS])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setVisible(false)
    setTimeout(() => { setNativePrompt(null); setShowIOS(false) }, 300)
  }

  async function install() {
    if (!nativePrompt) return
    await nativePrompt.prompt()
    const { outcome } = await nativePrompt.userChoice
    if (outcome === 'accepted') {
      setNativePrompt(null)
      setVisible(false)
    }
  }

  if (!nativePrompt && !showIOS) return null

  return (
    <div
      className={`fixed bottom-20 left-3 right-3 z-40 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-deep-teal text-white rounded-xl shadow-xl p-4 flex items-center gap-3">
        <img src="/logo.png" alt="" className="w-10 h-10 rounded-lg shrink-0 object-cover" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">Add to Home Screen</p>
          {showIOS ? (
            <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
              Tap <strong className="text-white">Share</strong> then <strong className="text-white">Add to Home Screen</strong> for offline access
            </p>
          ) : (
            <p className="text-xs text-white/70 mt-0.5">Install for offline access and a better experience</p>
          )}
        </div>
        {nativePrompt && (
          <button
            onClick={install}
            className="bg-gold text-white text-xs font-semibold rounded-lg px-3 py-2 shrink-0 hover:bg-gold/90 transition-colors"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          className="text-white/50 hover:text-white transition-colors text-base px-1 shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
