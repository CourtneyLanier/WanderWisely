export interface Trip {
  id: string
  name: string
  start_date: string
  end_date: string
  num_days: number
  share_code: string
  share_enabled: boolean
  created_at: string
}

export interface Day {
  id: string
  trip_id: string
  day_number: number
  date: string
  start_location: string
  end_location: string
  drive_miles: number | null
  drive_hours: number | null
  notes: string | null
}

export interface Lodging {
  id: string
  day_id: string
  name: string
  type: 'hotel' | 'airbnb' | 'other'
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

export interface Activity {
  id: string
  day_id: string
  name: string
  type: 'main' | 'side_quest' | 'meal' | 'reservation'
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  time: string | null
  address: string | null
  confirmation_number: string | null
  url: string | null
  estimated_cost: number | null
  notes: string | null
  is_booked: boolean
}

export interface Reservation {
  id: string
  trip_id: string
  type: 'flight' | 'hotel' | 'car' | 'restaurant' | 'activity' | 'other'
  title: string
  confirmation_number: string | null
  date: string | null
  time: string | null
  provider: string | null
  address: string | null
  details: Record<string, unknown> | null
  raw_email_text: string | null
  cost: number | null
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
  label: string
  logged_at: string
  entry_type: 'per_meal' | 'daily_total'
}
