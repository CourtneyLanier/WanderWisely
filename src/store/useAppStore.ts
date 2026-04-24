import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AppState {
  user: User | null
  tripId: string | null
  setUser: (user: User | null) => void
  setTripId: (id: string | null) => void
  signOut: () => Promise<void>
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      tripId: null,
      setUser: (user) => set({ user }),
      setTripId: (tripId) => set({ tripId }),
      signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, tripId: null })
      },
    }),
    {
      name: 'ww-app-store',
      partialize: (state) => ({ tripId: state.tripId }),
    }
  )
)
