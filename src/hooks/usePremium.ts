import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Profile } from '@/types'

// One premium gate for the whole app — "free to join, pay to plan" (§12).
// Only the OWNER's unlock ever matters: it gates enabling Split and the owner
// /split route. Member actions (join, add expense, pay, mark settled) are
// NEVER gated on this hook.
//
// Dev override so the feature can be built/tested unlocked:
//   - env:          VITE_PREMIUM_OVERRIDE=true
//   - localStorage: ww-premium-override = "true"
export function usePremium(): { isPremium: boolean; loading: boolean } {
  const user = useAppStore((s) => s.user)

  const query = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  })

  const devOverride =
    import.meta.env.VITE_PREMIUM_OVERRIDE === 'true' ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('ww-premium-override') === 'true')

  return {
    isPremium: devOverride || !!query.data?.is_premium,
    loading: !!user && query.isLoading,
  }
}
