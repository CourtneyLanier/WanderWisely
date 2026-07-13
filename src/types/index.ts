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
  share_days: boolean     // per-tab guest sharing (migration 009)
  share_route: boolean
  share_wallet: boolean
  share_budget: boolean
  share_notes: boolean
  share_map: boolean
  split_enabled: boolean        // group split (migration 011)
  split_currency: string
  split_deadline: string | null // settle-up deadline (YYYY-MM-DD)
  share_split: boolean          // split visible/joinable via share link
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
  listing_url: string | null    // owner-only: link to Airbnb/hotel listing
  paid?: boolean                // owner-only: marks whether this reservation has been paid (migration 003)
}

export interface Budget {
  id: string
  trip_id: string
  food_total: number
  food_days: number
  hotel_total: number
  hotel_buffer: number
  car_total_budget: number
  misc_total_budget: number | null  // null = no misc budget set (migration 010)
  notes: string | null
}

export interface SpendingLog {
  id: string
  trip_id: string
  day_id: string | null
  card: 'food' | 'hotel' | 'car' | 'misc'
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


export interface TripNote {
  id: string
  trip_id: string
  title: string
  content: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type DocType = 'itinerary' | 'side_quest' | 'packing_list' | 'other'

export interface TripDocument {
  id: string
  trip_id: string
  title: string
  doc_type: DocType
  content: string
  url: string | null
  file_path: string | null   // storage path in the 'trip-documents' bucket
  file_name: string | null   // original filename
  file_type: string | null   // mime type (application/pdf, image/*)
  file_size: number | null   // bytes
  sort_order: number
  created_at: string
  updated_at: string
}


// ============================================================
// GROUP SPLIT TYPES (migration 011)
// ============================================================

export type PayApp = 'venmo' | 'paypal' | 'cashapp' | 'other'
export type SplitMethod = 'even' | 'party_size' | 'custom'
export type SplitCategory =
  | 'Lodging' | 'Food' | 'Transportation' | 'Gas' | 'Activities' | 'Shopping' | 'Other'

export interface Traveler {
  id: string
  trip_id: string
  name: string
  party_size: number
  pay_app: PayApp | null
  pay_handle: string | null     // stored WITHOUT leading @ or $
  custom_weight: number
  settled: boolean              // the Dashboard "Paid?" column
  email: string | null          // optional; used to auto-claim a roster spot
  user_id: string | null        // set when a member claims this traveler; null = proxy
  sort_order: number
  created_at: string
}

export interface SplitExpense {
  id: string
  trip_id: string
  spent_on: string | null
  description: string | null
  category: SplitCategory | null
  paid_by: string | null        // traveler id
  amount: number
  split_method: SplitMethod
  shared_with: string[]         // traveler ids sharing this cost
  created_at: string
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: 'member'
  joined_at: string
}

export interface Profile {
  id: string
  is_premium: boolean
  license_code: string | null
  created_at: string
}


// ============================================================
// UTILITY TYPES
// ============================================================

export type LodgingType = NonNullable<Lodging['type']>
export type ActivityType = NonNullable<Activity['type']>
export type MealSlot = NonNullable<Activity['meal_slot']>
export type ReservationType = NonNullable<Reservation['type']>
export type SpendingCard = SpendingLog['card']
export type EntryType = SpendingLog['entry_type']
