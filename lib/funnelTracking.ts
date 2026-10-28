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

/**
 * Video play + watch-time tracking for a funnel's `<video>` element (local mp4 or any
 * direct src). Reads real `currentTime`/`duration` off the media element via native
 * `timeupdate`/`play`/`pause`/`ended` events — not a timer guess — so play, percent
 * milestones, and accumulated watched-seconds are accurate even through pause/seek.
 *
 * Events post to `/funnels/events` without requiring Steps-tab rows. Dashboard
 * aggregates avg watch time + play rate as KPIs; video names are omitted from
 * step drop-off. Rename via `eventPrefix` if you already fire `${eventPrefix}_*`.
 *
 * Shares the same visitor_id/session_id keys as `buildVisitorSnippet` so video events
 * attribute to the same session/UTM.
 *
 * Reload-safe: play/milestone/watched-seconds state is persisted to `sessionStorage`
 * per video src, so a reload mid-video does not refire milestones already reached or
 * reset accumulated watch time. A new tab/session (new `sweep_sid`) starts fresh,
 * which is correct — that's a new view.
 */
export function buildVideoTrackingSnippet(
  funnelId: string,
  opts: { videoSelector?: string; eventPrefix?: string; heartbeatSeconds?: number; apiBase?: string } = {}
): string {
  const apiBase = opts.apiBase || API_BASE_URL;
  const videoSelector = opts.videoSelector || 'video';
  const eventPrefix = opts.eventPrefix || 'video';
  const heartbeatSeconds = opts.heartbeatSeconds || 15;
  return `<script>
(function () {
  var FUNNEL_ID = '${funnelId}';
  var API = '${apiBase}';
  var PREFIX = '${eventPrefix}';
  var HEARTBEAT_SEC = ${heartbeatSeconds};
  var MILESTONES = [25, 50, 75, 90, 100];
  function sid(store, key) {
    try {
      var v = store.getItem(key);
      if (!v) { v = crypto.randomUUID(); store.setItem(key, v); }
      return v;
    } catch (e) { return null; }
  }
  var visitorId = sid(localStorage, 'sweep_vid');
  var sessionId = sid(sessionStorage, 'sweep_sid');
  function send(eventName, metadata) {
    fetch(API + '/funnels/events', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funnel_id: FUNNEL_ID,
        event_name: eventName,
        visitor_id: visitorId,
        session_id: sessionId,
        metadata: metadata
      })
    }).catch(function () {});
  }
  function loadState(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { started: false, ended: false, reached: {}, watchedSeconds: 0, lastHeartbeat: 0 };
  }
  function saveState(key, state) {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
  }
  function wire(video, index) {
    var src = video.currentSrc || video.querySelector('source') && video.querySelector('source').src || '';
    var stateKey = 'sweep_vt_' + sessionId + '_' + (src || index);
    var state = loadState(stateKey);
    var lastTime = video.currentTime || 0;
    function percentComplete() {
      if (!video.duration || isNaN(video.duration)) return 0;
      return Math.min(100, Math.round((video.currentTime / video.duration) * 100));
    }
    function payload(extra) {
      var base = {
        video_src: src,
        video_index: index,
        current_time: Math.round(video.currentTime * 10) / 10,
        duration: video.duration || null,
        percent: percentComplete(),
        watched_seconds: Math.round(state.watchedSeconds * 10) / 10
      };
      for (var k in extra) { base[k] = extra[k]; }
      return base;
    }
    video.addEventListener('play', function () {
      if (!state.started) {
        state.started = true;
        saveState(stateKey, state);
        send(PREFIX + '_play', payload({}));
      }
    });
    video.addEventListener('pause', function () {
      if (!video.ended) send(PREFIX + '_pause', payload({}));
    });
    video.addEventListener('timeupdate', function () {
      var t = video.currentTime;
      var delta = t - lastTime;
      // Only count forward, in-range playback as watched time; ignore big jumps (seeks/loops).
      if (!video.paused && delta > 0 && delta < 1.5) state.watchedSeconds += delta;
      lastTime = t;
      var pct = percentComplete();
      var dirty = false;
      MILESTONES.forEach(function (m) {
        if (pct >= m && !state.reached[m]) {
          state.reached[m] = true;
          dirty = true;
          send(PREFIX + '_' + m, payload({}));
        }
      });
      if (state.watchedSeconds - state.lastHeartbeat >= HEARTBEAT_SEC) {
        state.lastHeartbeat = state.watchedSeconds;
        dirty = true;
        send(PREFIX + '_watch_heartbeat', payload({}));
      }
      if (dirty) saveState(stateKey, state);
    });
    video.addEventListener('ended', function () {
      if (!state.ended) {
        state.ended = true;
        saveState(stateKey, state);
        send(PREFIX + '_complete', payload({}));
      }
    });
  }
  function init() {
    var videos = document.querySelectorAll('${videoSelector}');
    for (var i = 0; i < videos.length; i++) wire(videos[i], i);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
</script>`;
}
