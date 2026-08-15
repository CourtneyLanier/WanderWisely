// Supabase Database type — mirrors 001_initial_schema.sql
// Insert types are defined outside Database to avoid circular self-references (which resolve to `never`).

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ── Insert shapes (defined standalone so Update = Partial<Insert> is non-circular) ──

type TripInsert = {
  id?: string
  owner_uid: string
  name: string
  start_date?: string | null
  end_date?: string | null
  num_days?: number | null
  share_code?: string
  share_enabled?: boolean
  share_days?: boolean
  share_route?: boolean
  share_wallet?: boolean
  share_budget?: boolean
  share_notes?: boolean
  share_map?: boolean
  split_enabled?: boolean
  split_currency?: string
  split_deadline?: string | null
  share_split?: boolean
  created_at?: string
}

type TravelerInsert = {
  id?: string
  trip_id: string
  name: string
  party_size?: number
  pay_app?: 'venmo' | 'paypal' | 'cashapp' | 'other' | null
  pay_handle?: string | null
  custom_weight?: number
  settled?: boolean
  email?: string | null
  user_id?: string | null
  sort_order?: number
  created_at?: string
}

type TripMemberInsert = {
  id?: string
  trip_id: string
  user_id: string
  role?: 'member'
  joined_at?: string
}

type SplitExpenseInsert = {
  id?: string
  trip_id: string
  spent_on?: string | null
  description?: string | null
  category?: string | null
  paid_by?: string | null
  amount: number
  split_method?: 'even' | 'party_size' | 'custom'
  shared_with?: string[]
  created_at?: string
}

type ProfileInsert = {
  id: string
  is_premium?: boolean
  license_code?: string | null
  created_at?: string
}

type DayInsert = {
  id?: string
  trip_id: string
  day_number: number
  date?: string | null
  departure_time?: string | null
  start_location?: string | null
  end_location?: string | null
  start_weather_location?: string | null
  end_weather_location?: string | null
  drive_miles?: number | null
  drive_hours?: number | null
  notes?: string | null
}

type LodgingInsert = {
  id?: string
  day_id: string
  name?: string | null
  type?: 'hotel' | 'airbnb' | 'other' | null
  address?: string | null
  listing_url?: string | null
  confirmation_number?: string | null
  check_in_time?: string | null
  check_out_time?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  beds?: number | null
  room_type?: string | null
  nightly_rate?: number | null
  total_cost?: number | null
  notes?: string | null
}

type ActivityInsert = {
  id?: string
  day_id: string
  name?: string | null
  type?: 'main' | 'side_quest' | 'meal' | 'reservation' | null
  meal_slot?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  time?: string | null
  address?: string | null
  confirmation_number?: string | null
  url?: string | null
  estimated_cost?: number | null
  notes?: string | null
  is_booked?: boolean
  sort_order?: number
}

type ReservationInsert = {
  id?: string
  trip_id: string
  type?: 'flight' | 'hotel' | 'car' | 'restaurant' | 'activity' | 'other' | null
  title?: string | null
  confirmation_number?: string | null
  date?: string | null
  time?: string | null
  provider?: string | null
  address?: string | null
  details?: Json
  raw_email_text?: string | null
  cost?: number | null
  pdf_url?: string | null
  pdf_path?: string | null
  listing_url?: string | null
  paid?: boolean
}

type BudgetInsert = {
  id?: string
  trip_id: string
  food_total?: number
  food_days?: number
  hotel_total?: number
  hotel_buffer?: number
  car_total_budget?: number
  misc_total_budget?: number | null
  notes?: string | null
}

type SpendingLogInsert = {
  id?: string
  trip_id: string
  day_id?: string | null
  card: 'food' | 'hotel' | 'car' | 'misc'
  amount: number
  label?: string | null
  logged_at?: string
  entry_type: 'per_meal' | 'daily_total'
}

type TripNoteInsert = {
  id?: string
  trip_id: string
  title?: string
  content?: string
  sort_order?: number
  created_at?: string
  updated_at?: string
}

type TripDocumentInsert = {
  id?: string
  trip_id: string
  title: string
  doc_type?: 'itinerary' | 'side_quest' | 'packing_list' | 'other'
  content?: string
  url?: string | null
  file_path?: string | null
  file_name?: string | null
  file_type?: string | null
  file_size?: number | null
  sort_order?: number
  created_at?: string
  updated_at?: string
}

// ── Database type ──────────────────────────────────────────────────────────────
// Each table requires `Relationships: []` to satisfy GenericTable from supabase-js.
// Schema requires `Views: Record<string, never>` to satisfy GenericSchema.

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string
          owner_uid: string
          name: string
          start_date: string | null
          end_date: string | null
          num_days: number | null
          share_code: string
          share_enabled: boolean
          share_days: boolean
          share_route: boolean
          share_wallet: boolean
          share_budget: boolean
          share_notes: boolean
          share_map: boolean
          split_enabled: boolean
          split_currency: string
          split_deadline: string | null
          share_split: boolean
          created_at: string
        }
        Insert: TripInsert
        Update: Partial<TripInsert>
        Relationships: []
      }
      travelers: {
        Row: {
          id: string
          trip_id: string
          name: string
          party_size: number
          pay_app: 'venmo' | 'paypal' | 'cashapp' | 'other' | null
          pay_handle: string | null
          custom_weight: number
          settled: boolean
          email: string | null
          user_id: string | null
          sort_order: number
          created_at: string
        }
        Insert: TravelerInsert
        Update: Partial<TravelerInsert>
        Relationships: []
      }
      trip_members: {
        Row: {
          id: string
          trip_id: string
          user_id: string
          role: 'member'
          joined_at: string
        }
        Insert: TripMemberInsert
        Update: Partial<TripMemberInsert>
        Relationships: []
      }
      split_expenses: {
        Row: {
          id: string
          trip_id: string
          spent_on: string | null
          description: string | null
          category: string | null
          paid_by: string | null
          amount: number
          split_method: 'even' | 'party_size' | 'custom'
          shared_with: string[]
          created_at: string
        }
        Insert: SplitExpenseInsert
        Update: Partial<SplitExpenseInsert>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          is_premium: boolean
          license_code: string | null
          created_at: string
        }
        Insert: ProfileInsert
        Update: Partial<ProfileInsert>
        Relationships: []
      }
      days: {
        Row: {
          id: string
          trip_id: string
          day_number: number
          date: string | null
          departure_time: string | null
          start_location: string | null
          end_location: string | null
          start_weather_location: string | null
          end_weather_location: string | null
          drive_miles: number | null
          drive_hours: number | null
          notes: string | null
        }
        Insert: DayInsert
        Update: Partial<DayInsert>
        Relationships: []
      }
      lodging: {
        Row: {
          id: string
          day_id: string
          name: string | null
          type: 'hotel' | 'airbnb' | 'other' | null
          address: string | null
          listing_url: string | null
          confirmation_number: string | null
          check_in_time: string | null
          check_out_time: string | null
          bedrooms: number | null
          bathrooms: number | null
          beds: number | null
          room_type: string | null
          nightly_rate: number | null
          total_cost: number | null
          notes: string | null
        }
        Insert: LodgingInsert
        Update: Partial<LodgingInsert>
        Relationships: []
      }
      activities: {
        Row: {
          id: string
          day_id: string
          name: string | null
          type: 'main' | 'side_quest' | 'meal' | 'reservation' | null
          meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
          time: string | null
          address: string | null
          confirmation_number: string | null
          url: string | null
          estimated_cost: number | null
          notes: string | null
          is_booked: boolean
          sort_order: number
        }
        Insert: ActivityInsert
        Update: Partial<ActivityInsert>
        Relationships: []
      }
      reservations: {
        Row: {
          id: string
          trip_id: string
          type: 'flight' | 'hotel' | 'car' | 'restaurant' | 'activity' | 'other' | null
          title: string | null
          confirmation_number: string | null
          date: string | null
          time: string | null
          provider: string | null
          address: string | null
          details: Json
          raw_email_text: string | null
          cost: number | null
          pdf_url: string | null
          pdf_path: string | null
          listing_url: string | null
          paid: boolean
        }
        Insert: ReservationInsert
        Update: Partial<ReservationInsert>
        Relationships: []
      }
      budget: {
        Row: {
          id: string
          trip_id: string
          food_total: number
          food_days: number
          hotel_total: number
          hotel_buffer: number
          car_total_budget: number
          misc_total_budget: number | null
          notes: string | null
        }
        Insert: BudgetInsert
        Update: Partial<BudgetInsert>
        Relationships: []
      }
      spending_log: {
        Row: {
          id: string
          trip_id: string
          day_id: string | null
          card: 'food' | 'hotel' | 'car' | 'misc'
          amount: number
          label: string | null
          logged_at: string
          entry_type: 'per_meal' | 'daily_total'
        }
        Insert: SpendingLogInsert
        Update: Partial<SpendingLogInsert>
        Relationships: []
      }
      trip_notes: {
        Row: {
          id: string
          trip_id: string
          title: string
          content: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: TripNoteInsert
        Update: Partial<TripNoteInsert>
        Relationships: []
      }
      trip_documents: {
        Row: {
          id: string
          trip_id: string
          title: string
          doc_type: 'itinerary' | 'side_quest' | 'packing_list' | 'other'
          content: string
          url: string | null
          file_path: string | null
          file_name: string | null
          file_type: string | null
          file_size: number | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: TripDocumentInsert
        Update: Partial<TripDocumentInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      guest_get_trip: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          name: string
          start_date: string | null
          end_date: string | null
          num_days: number | null
          share_code: string
          share_enabled: boolean
          created_at: string
          share_days: boolean
          share_route: boolean
          share_wallet: boolean
          share_budget: boolean
          share_notes: boolean
          share_map: boolean
          share_split: boolean
        }[]
      }
      join_trip_via_share_code: {
        Args: { p_share_code: string }
        Returns: string | null
      }
      claim_traveler: {
        Args: { p_traveler_id: string }
        Returns: boolean
      }
      guest_get_notes: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          title: string
          content: string
          sort_order: number
        }[]
      }
      guest_get_documents: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          title: string
          doc_type: string
          content: string
          url: string | null
          sort_order: number
        }[]
      }
      guest_get_budget: {
        Args: { p_share_code: string }
        Returns: {
          food_total: number
          food_days: number
          hotel_buffer: number
          car_total_budget: number
        }[]
      }
      guest_get_spending_summary: {
        Args: { p_share_code: string }
        Returns: {
          card: string
          spent: number
        }[]
      }
      guest_get_days: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          trip_id: string
          day_number: number
          date: string | null
          departure_time: string | null
          start_location: string | null
          end_location: string | null
          start_weather_location: string | null
          end_weather_location: string | null
          drive_miles: number | null
          drive_hours: number | null
          notes: string | null
        }[]
      }
      guest_get_lodging: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          day_id: string
          name: string | null
          type: string | null
          address: string | null
          listing_url: string | null
          confirmation_number: string | null
          check_in_time: string | null
          check_out_time: string | null
          bedrooms: number | null
          bathrooms: number | null
          beds: number | null
          room_type: string | null
          notes: string | null
        }[]
      }
      guest_get_activities: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          day_id: string
          name: string | null
          type: string | null
          meal_slot: string | null
          time: string | null
          address: string | null
          confirmation_number: string | null
          url: string | null
          notes: string | null
          is_booked: boolean
          sort_order: number
        }[]
      }
      guest_get_reservations: {
        Args: { p_share_code: string }
        Returns: {
          id: string
          trip_id: string
          type: string | null
          title: string | null
          confirmation_number: string | null
          date: string | null
          time: string | null
          provider: string | null
          address: string | null
          details: Json | null
        }[]
      }
    }
  }
}
