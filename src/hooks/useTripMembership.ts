import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// Membership via the share link (blueprint §10): a logged-in visitor to
// /trip/:shareCode is auto-enrolled as a trip member through the
// join_trip_via_share_code SECURITY DEFINER function (which validates
// share_enabled && share_split && split_enabled, upserts trip_members, and
// auto-claims a roster spot when the owner entered this user's email).
//
// Joining is free — members NEVER hit a paywall (§12).
export function useTripMembership(shareCode: string | undefined, enabled: boolean) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setChecking(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const joinQuery = useQuery({
    queryKey: ['join_trip', shareCode, user?.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('join_trip_via_share_code', {
        p_share_code: shareCode!,
      })
      if (error) throw error
      return (data as string | null) ?? null
    },
    enabled: enabled && !!shareCode && !!user,
    staleTime: 1000 * 60 * 5,
  })

  return {
    user,                                  // null = anonymous visitor
    checkingSession: checking,
    tripId: joinQuery.data ?? null,        // set once enrolled
    joining: !!user && joinQuery.isLoading,
    joinError: joinQuery.error as Error | null,
  }
}
