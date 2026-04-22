// App-level TypeScript types — derived from Database type in database.ts
import type { Json } from './database'
export type { Json }

// ============================================================
// OWNER TYPES (full columns, authenticated only)
// ============================================================

export interface Trip {
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

export interface Day {
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

export interface Lodging {
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
  nightly_rate: number | null   // owner-only
  total_cost: number | null     // owner-only
  notes: string | null
}

export interface Activity {
  id: string
  day_id: string
  name: string | null
  type: 'main' | 'side_quest' | 'meal' | 'reservation' | null
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  time: string | null
  address: string | null
  confirmation_number: string | null
  url: string | null
  estimated_cost: number | null // owner-only
  notes: string | null
  is_booked: boolean
  sort_order: number
}

export interface Reservation {
  id: string
  trip_id: string
  type: 'flight' | 'hotel' | 'car' | 'restaurant' | 'activity' | 'other' | null
  title: string | null
  confirmation_number: string | null
  date: string | null
  time: string | null
  provider: string | null
  address: string | null
  details: Json | null
  raw_email_text: string | null // owner-only
  cost: number | null           // owner-only
  pdf_url: string | null        // owner-only
}

export interface Budget {
  id: string
  trip_id: string
  food_total: number
  food_days: number
  hotel_total: number
  hotel_buffer: number
  car_total_budget: number
  notes: string | null
}

export interface SpendingLog {
  id: string
  trip_id: string
  day_id: string | null
  card: 'food' | 'hotel' | 'car'
  amount: number
  label: string | null
  logged_at: string
  entry_type: 'per_meal' | 'daily_total'
}


// ============================================================
// GUEST TYPES (sensitive columns omitted)
// Returned by guest_get_* SECURITY DEFINER functions
// ============================================================

export type GuestTrip = Omit<Trip, 'owner_uid'>

export type GuestDay = Day

export type GuestLodging = Omit<Lodging, 'nightly_rate' | 'total_cost'>

export type GuestActivity = Omit<Activity, 'estimated_cost'>

export type GuestReservation = Omit<Reservation, 'cost' | 'raw_email_text'>


// ============================================================
// UTILITY TYPES
// ============================================================

export type LodgingType = NonNullable<Lodging['type']>
export type ActivityType = NonNullable<Activity['type']>
export type MealSlot = NonNullable<Activity['meal_slot']>
export type ReservationType = NonNullable<Reservation['type']>
export type SpendingCard = SpendingLog['card']
export type EntryType = SpendingLog['entry_type']
