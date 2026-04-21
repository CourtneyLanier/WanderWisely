import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Trip } from '@/types'

export function useTrip() {
  const user = useAppStore((s) => s.user)
  const setTripId = useAppStore((s) => s.setTripId)

  const query = useQuery({
    queryKey: ['trip', user?.id],
    queryFn: async (): Promise<Trip | null> => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('owner_uid', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  })

  // Sync tripId into global store whenever trip loads or changes
  useEffect(() => {
    if (query.data?.id) setTripId(query.data.id)
  }, [query.data?.id, setTripId])

  return query
}
