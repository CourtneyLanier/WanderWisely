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
}

type BudgetInsert = {
  id?: string
  trip_id: string
  food_total?: number
  food_days?: number
  hotel_total?: number
  hotel_buffer?: number
  car_total_budget?: number
  notes?: string | null
}

type SpendingLogInsert = {
  id?: string
  trip_id: string
  day_id?: string | null
  card: 'food' | 'hotel' | 'car'
  amount: number
  label?: string | null
  logged_at?: string
  entry_type: 'per_meal' | 'daily_total'
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
          created_at: string
        }
        Insert: TripInsert
        Update: Partial<TripInsert>
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
          card: 'food' | 'hotel' | 'car'
          amount: number
          label: string | null
          logged_at: string
          entry_type: 'per_meal' | 'daily_total'
        }
        Insert: SpendingLogInsert
        Update: Partial<SpendingLogInsert>
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
          details: Json
        }[]
      }
    }
  }
}
