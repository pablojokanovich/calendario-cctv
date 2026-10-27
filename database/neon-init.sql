CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY,
  order_number text NOT NULL,
  event_name text NOT NULL,
  location text NOT NULL,
  setup_date text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL,
  phase text NOT NULL,
  color text NOT NULL,
  assignments text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS events_start_date_order_number_idx
  ON events (start_date, order_number);

CREATE TABLE IF NOT EXISTS event_service_orders (
  event_id integer PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 3145728),
  content text NOT NULL,
  updated_at text NOT NULL
);
