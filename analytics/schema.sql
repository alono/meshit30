-- D1 schema for usage analytics. Paste into the D1 console once, at setup.
--
-- One row per device, per screen, per day. That grain is the point: it is
-- enough to count distinct and returning devices and to rank the screens, and
-- too coarse to reconstruct anyone's session. There is no clock time and no
-- IP address anywhere in the table.
--
-- Row volume is roughly (devices x screens) per day — about 800 rows a day at
-- 100 daily devices, against a free-tier ceiling of 100,000 writes a day.

CREATE TABLE IF NOT EXISTS hits (
  day     TEXT    NOT NULL,             -- 'YYYY-MM-DD', UTC
  aid     TEXT    NOT NULL,             -- random device id, minted in the browser
  screen  TEXT    NOT NULL,             -- home | signals | subject | learn | …
  subject TEXT    NOT NULL DEFAULT '',  -- subject slug, '' off the subject screens
  n       INTEGER NOT NULL DEFAULT 1,   -- times that device opened it that day
  PRIMARY KEY (day, aid, screen, subject)
);

-- The primary key index is day-first, so the date-ranged queries in
-- queries.sql use it and no second index is needed.
