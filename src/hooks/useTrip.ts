import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Trip } from '@/types'

export function useTrip() {
  const tripId = useAppStore((s) => s.tripId)
  const setTripId = useAppStore((s) => s.setTripId)

  const query = useQuery({
    queryKey: ['trip', tripId],
    queryFn: async (): Promise<Trip | null> => {
      if (!tripId) return null
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!tripId,
    staleTime: 1000 * 60 * 5,
  })

  // If the trip no longer exists (deleted or invalid), clear the stored id
  useEffect(() => {
    if (query.isSuccess && query.data === null && tripId) {
      setTripId(null)
    }
  }, [query.isSuccess, query.data, tripId, setTripId])

  return query
}
