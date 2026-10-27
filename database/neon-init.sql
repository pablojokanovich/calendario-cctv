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

CREATE TABLE IF NOT EXISTS event_documents (
  id text PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
  uploaded_at text NOT NULL,
  expires_at text NOT NULL,
  complete boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS event_document_chunks (
  document_id text NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
  part integer NOT NULL CHECK (part >= 0 AND part < 10),
  content text NOT NULL,
  PRIMARY KEY(document_id, part)
);
CREATE INDEX IF NOT EXISTS event_documents_event_idx ON event_documents(event_id);
CREATE INDEX IF NOT EXISTS event_documents_expiry_idx ON event_documents(expires_at);
CREATE TABLE IF NOT EXISTS event_workspaces (
  event_id integer PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  state text NOT NULL,
  updated_at text NOT NULL
);
