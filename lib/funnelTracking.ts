/**
 * Copy-ready setup values for funnels hosted outside Sweep (GoHighLevel today).
 * The visitor snippet posts one `view:<path>` event per page load to the public
 * POST /funnels/events route; GHL-paired funnels get one Sweep step per GHL step
 * with the same event names, so Visitors and per-step drop-off both work.
 */

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export const GHL_WEBHOOK_SECRET_HEADER = 'x-ghl-webhook-secret';

export function buildVisitorSnippet(funnelId: string, apiBase: string = API_BASE_URL): string {
  return `<script>
(function () {
  var FUNNEL_ID = '${funnelId}';
  var API = '${apiBase}';
  function sid(store, key) {
    try {
      var v = store.getItem(key);
      if (!v) { v = crypto.randomUUID(); store.setItem(key, v); }
      return v;
    } catch (e) { return null; }
  }
  var q = new URLSearchParams(location.search), utm = {};
  ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) {
    var v = q.get('utm_' + k); if (v) utm[k] = v;
  });
  var path = '/' + location.pathname.replace(/^\\/+|\\/+$/g, '').toLowerCase();
  fetch(API + '/funnels/events', {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      funnel_id: FUNNEL_ID,
      event_name: 'view:' + path.slice(0, 95),
      visitor_id: sid(localStorage, 'sweep_vid'),
      session_id: sid(sessionStorage, 'sweep_sid'),
      metadata: { path: path, referrer: document.referrer || null, utm: utm }
    })
  }).catch(function () {});
})();
</script>`;
}

export function ghlWebhookUrl(orgId: string, apiBase: string = API_BASE_URL): string {
  return `${apiBase}/webhooks/ghl/${orgId}`;
}
