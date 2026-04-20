import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'

interface AppState {
  user: User | null
  tripId: string | null
  setUser: (user: User | null) => void
  setTripId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  tripId: null,
  setUser: (user) => set({ user }),
  setTripId: (tripId) => set({ tripId }),
}))
