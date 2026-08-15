// Usage analytics: how many devices, coming back how often, using which screen.
//
// Cloudflare Web Analytics (enabled in the Pages dashboard, injected at the
// edge, nothing in this repo) already reports traffic, country, device and
// referrer. The one thing it cannot report is people: it counts "visits", a
// page view arriving from off-site, and has no unique-visitor metric at all.
// So this module sends one line per screen opened — day, device, screen — to
// /api/v, and that is the whole payload. No answers, no scores, no timing.
//
// Nothing is sent in development, mirroring the service-worker registration in
// main.jsx, so local clicking never lands in the production database.

const AID_KEY = 'meshit30:aid:v1';
const OFF_KEY = 'meshit30:analytics:v1';
const ENDPOINT = '/api/v';

/**
 * Both keys sit OUTSIDE the `meshit30:v1:` prefix that exportAll walks, for the
 * same reason the disclaimer flag does: a backup restored on a second device
 * must not clone the device id (which would merge two devices into one) or
 * carry one person's opt-out onto someone else's phone.
 */
export function isEnabled() {
  try {
    return localStorage.getItem(OFF_KEY) !== 'off';
  } catch {
    // Storage blocked: no id can be kept, so there is nothing worth sending.
    return false;
  }
}

export function setEnabled(on) {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, 'off');
  } catch {
    // Nothing to do; the switch simply will not stick.
  }
}

function deviceId() {
  try {
    let id = localStorage.getItem(AID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(AID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Fire-and-forget. A failure here must never be visible to the learner. */
export function sendView(screen, subject) {
  if (!import.meta.env.PROD || !isEnabled()) return;
  try {
    const aid = deviceId();
    if (!aid) return;
    const body = JSON.stringify({ aid, screen, subject: subject ?? '' });
    const blob = new Blob([body], { type: 'application/json' });
    // sendBeacon survives the page being closed; fetch is the fallback for
    // browsers that refuse the beacon (it is rejected while offline).
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
    fetch(ENDPOINT, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    }).catch(() => {});
  } catch {
    // Analytics is never worth an error path.
  }
}
