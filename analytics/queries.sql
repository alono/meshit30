-- Read-outs for the usage table. Paste one at a time into the D1 console:
-- Cloudflare dashboard → Storage & Databases → D1 → meshit30-usage → Console.
--
-- "Devices", not people: one person with a phone and a laptop counts twice,
-- and clearing site data mints a new id. It is still much closer to a headcount
-- than Cloudflare's "visits", which counts arrivals from off-site.

-- 1. Daily reach — distinct devices and screens opened, last 30 days.
SELECT day,
       COUNT(DISTINCT aid) AS devices,
       SUM(n)              AS views
FROM hits
WHERE day >= date('now', '-30 days')
GROUP BY day
ORDER BY day DESC;

-- 2. Are they coming back? Devices by how many separate days they showed up.
WITH seen AS (
  SELECT aid, COUNT(DISTINCT day) AS days
  FROM hits
  WHERE day >= date('now', '-30 days')
  GROUP BY aid
)
SELECT COUNT(*)                        AS devices,
       SUM(days = 1)                   AS once_only,
       SUM(days > 1)                   AS returned,
       SUM(days >= 5)                  AS regulars,
       ROUND(AVG(days), 1)             AS avg_days
FROM seen;

-- 3. Which areas get used, last 30 days.
SELECT screen,
       COUNT(DISTINCT aid) AS devices,
       SUM(n)              AS views
FROM hits
WHERE day >= date('now', '-30 days')
GROUP BY screen
ORDER BY views DESC;

-- 4. Which subject gets the attention, last 30 days.
SELECT subject,
       COUNT(DISTINCT aid) AS devices,
       SUM(n)              AS views
FROM hits
WHERE subject <> '' AND day >= date('now', '-30 days')
GROUP BY subject
ORDER BY views DESC;

-- 5. Exam funnel: devices that opened the simulation vs reached a result.
--    Note it counts the exam SCREEN, not papers started — the intro card and a
--    running paper share one address, because a paper in progress cannot be
--    restored from a URL.
SELECT subject,
       COUNT(DISTINCT CASE WHEN screen = 'exam'    THEN aid END) AS opened_exam,
       COUNT(DISTINCT CASE WHEN screen = 'results' THEN aid END) AS saw_results
FROM hits
WHERE subject <> '' AND day >= date('now', '-30 days')
GROUP BY subject
ORDER BY opened_exam DESC;

-- 6. Housekeeping. Nothing expires on its own; run this when a year is enough.
-- DELETE FROM hits WHERE day < date('now', '-365 days');
