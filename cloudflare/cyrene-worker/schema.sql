CREATE TABLE IF NOT EXISTS cyrene_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  scheduled_date TEXT,
  scheduled_hour INTEGER,
  scheduled_minute INTEGER,
  active_plan_json TEXT,
  last_note TEXT,
  last_letter_date TEXT,
  last_sent_date TEXT
);
INSERT OR IGNORE INTO cyrene_settings (id, enabled) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS cyrene_letters (
  letter_date TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  day_note TEXT,
  promise_json TEXT,
  sent INTEGER NOT NULL DEFAULT 0
);