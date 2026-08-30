(() => {
  'use strict';

  const SESSION_KEY = 'jobsearch-site-key-v1';
  const AAD = new TextEncoder().encode('jobsearch-public-pages:v1');
  const POLL_MS = 60000;
  const HISTORY_VISIBLE = 5;
  const DEFAULT_LINGER_MS = 4500;
  const seenEventIds = new Set();
  const queuedEventIds = new Set();
  const journeyQueue = [];
  let journeyRunning = false;
  let journeyToken = 0;
  let initialised = false;
  let envelopeRevision = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sphereActive = () => document.getElementById('view-sphere')?.getAttribute('aria-pressed') === 'true';
  const spinButton = () => document.querySelector('#employer-advanced .sphere-control.spin');

  function ensureAutoSpin() {
    if (!sphereActive()) return;
    const button = spinButton();
    if (button && !button.classList.contains('active')) button.click();
  }

  function cancelJourney() {
    journeyToken += 1;
    journeyQueue.length = 0;
    journeyRunning = false;
    document.querySelectorAll('.sphere-employer.journey-focus').forEach(card => card.classList.remove('journey-focus'));
    setTimeout(ensureAutoSpin, 150);
  }

  function normaliseStops(stops) {
    return (Array.isArray(stops) ? stops : []).map(stop => {
      if (typeof stop === 'string') return { canonical_id: stop };
      return stop && typeof stop === 'object' ? stop : null;
    }).filter(stop => /^ce_[a-f0-9]{32}$/.test(String(stop?.canonical_id || '')));
  }

  function findCard(canonicalId) {
    return [...document.querySelectorAll('#employer-advanced .sphere-employer[data-employer-canonical-id]')]
      .find(card => card.dataset.employerCanonicalId === canonicalId) || null;
  }

  async function playStops(stops, options = {}) {
    const items = normaliseStops(stops);
    if (!items.length) return;
    if (options.switchToSphere && !sphereActive()) {
      document.getElementById('view-sphere')?.click();
      await sleep(450);
    }
    if (!sphereActive()) return;

    const token = ++journeyToken;
    journeyRunning = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const stop of items) {
      if (token !== journeyToken || !sphereActive()) break;
      const card = findCard(stop.canonical_id);
      if (!card || card.classList.contains('filtered')) continue;

      document.querySelectorAll('.sphere-employer.journey-focus').forEach(c => c.classList.remove('journey-focus'));
      if (!reduced) {
        card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
        await sleep(1550);
        if (token !== journeyToken) break;
      }
      card.click();
      card.classList.add('journey-focus');
      const details = document.querySelector('#employer-advanced .sphere-details');
      if (details && stop.reason) details.dataset.journeyReason = String(stop.reason);
      if (!reduced) ensureAutoSpin();
      await sleep(Math.max(1200, Number(stop.linger_ms) || DEFAULT_LINGER_MS));
    }

    document.querySelectorAll('.sphere-employer.journey-focus').forEach(card => card.classList.remove('journey-focus'));
    if (token === journeyToken) {
      journeyRunning = false;
      ensureAutoSpin();
      drainJourneyQueue();
    }
  }

  function drainJourneyQueue() {
    if (journeyRunning || !journeyQueue.length || !sphereActive()) return;
    const next = journeyQueue.shift();
    playStops(next.stops, next.options);
  }

  function enqueueJourney(stops, options = {}) {
    const eventId = String(options.eventId || '');
    if (eventId && queuedEventIds.has(eventId)) return false;
    const items = normaliseStops(stops);
    if (!items.length) return false;
    if (eventId) queuedEventIds.add(eventId);
    journeyQueue.push({ stops: items, options });
    drainJourneyQueue();
    return true;
  }

  window.EmployerJourneys = {
    play: playStops,
    enqueue: enqueueJourney,
    cancel: cancelJourney,
    get active() { return journeyRunning; },
  };

  function installStyles() {
    if (document.getElementById('employer-experience-style')) return;
    const style = document.createElement('style');
    style.id = 'employer-experience-style';
    style.textContent = `
      .employer-activity{margin:12px 0 16px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:rgba(13,17,23,.24)}
      .employer-activity-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}
      .employer-activity-list{display:grid;gap:5px}
      .employer-activity-row{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 0;border-top:1px solid rgba(139,148,158,.14);font-size:11px}
      .employer-activity-row:first-child{border-top:0}.employer-activity-time{opacity:.62;font-variant-numeric:tabular-nums}.employer-activity-source{font-weight:760}.employer-activity-summary{opacity:.82}
      .employer-activity-replay{font:inherit;border:1px solid var(--border);background:transparent;color:inherit;border-radius:5px;padding:3px 6px;cursor:pointer}
      .sphere-employer.journey-focus{outline:2px solid currentColor;outline-offset:3px;filter:brightness(1.16)}
      .sphere-details[data-journey-reason]::before{content:"UPDATE · " attr(data-journey-reason);display:block;margin:0 0 7px;font-size:10px;font-weight:760;letter-spacing:.07em;text-transform:uppercase;opacity:.72}
      @media(max-width:620px){.employer-activity-row{grid-template-columns:44px minmax(0,1fr)}.employer-activity-replay{grid-column:2;justify-self:start}}
    `;
    document.head.appendChild(style);
  }

  function activityEvents() {
    return Array.isArray(state?.data?.activity?.events) ? state.data.activity.events : [];
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function ensureActivityPanel() {
    let panel = document.getElementById('employer-activity');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'employer-activity';
    panel.className = 'employer-activity';
    panel.setAttribute('aria-label', 'Recent employer activity');
    document.getElementById('landscape-summary')?.after(panel);
    return panel;
  }

  function replayEvent(event) {
    const ids = Array.isArray(event.canonical_ids) ? event.canonical_ids : [];
    const stops = ids.map(canonical_id => ({ canonical_id, reason: event.summary, linger_ms: DEFAULT_LINGER_MS }));
    enqueueJourney(stops, { eventId: `replay:${event.id}:${Date.now()}`, switchToSphere: true });
  }

  function renderActivity() {
    const panel = ensureActivityPanel();
    if (!panel) return;
    const events = activityEvents().slice().reverse();
    if (!events.length) {
      panel.innerHTML = '<div class="employer-activity-head"><span class="eyebrow">Activity</span><span class="subtle">Waiting for published updates</span></div>';
      return;
    }
    const visible = events.slice(0, HISTORY_VISIBLE);
    panel.innerHTML = `<div class="employer-activity-head"><span class="eyebrow">Activity</span><span class="subtle">Latest ${visible.length} of ${events.length}</span></div><div class="employer-activity-list">${visible.map((event, index) => {
      const replay = Array.isArray(event.canonical_ids) && event.canonical_ids.length ? `<button class="employer-activity-replay" type="button" data-activity-index="${index}">Replay</button>` : '';
      return `<div class="employer-activity-row"><span class="employer-activity-time">${esc(formatTime(event.at))}</span><span><span class="employer-activity-source">${esc(event.source || 'Update')}</span><br><span class="employer-activity-summary">${esc(event.summary || event.kind || 'Published update')}</span></span>${replay}</div>`;
    }).join('')}</div>`;
    panel.querySelectorAll('[data-activity-index]').forEach(button => button.addEventListener('click', () => replayEvent(visible[Number(button.dataset.activityIndex)])));
  }

  function observeNewActivity(previousIds) {
    const fresh = activityEvents().filter(event => event?.id && !previousIds.has(String(event.id)));
    for (const event of fresh) {
      seenEventIds.add(String(event.id));
      if (!sphereActive() || !Array.isArray(event.canonical_ids) || !event.canonical_ids.length) continue;
      const stops = event.canonical_ids.map(canonical_id => ({ canonical_id, reason: event.summary, linger_ms: DEFAULT_LINGER_MS }));
      enqueueJourney(stops, { eventId: String(event.id) });
    }
  }

  function b64bytes(value) {
    const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    const padded = text + '='.repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }

  async function decryptEnvelope(envelope, rawKey) {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64bytes(envelope.iv), additionalData: AAD, tagLength: 128 }, key, b64bytes(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  function encryptedUrl() {
    const own = [...document.scripts].find(script => /employer-experience\.js(?:\?|$)/.test(script.src));
    return new URL('../site-data.enc.json', own?.src || location.href).href;
  }

  async function pollForUpdate() {
    if (document.hidden || typeof state === 'undefined' || !state.data) return;
    try {
      const response = await fetch(encryptedUrl(), { cache: 'no-store' });
      if (!response.ok) return;
      const envelope = await response.json();
      const revision = String(envelope.iv || '');
      if (!envelopeRevision) { envelopeRevision = revision; return; }
      if (!revision || revision === envelopeRevision) return;
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const bundle = await decryptEnvelope(envelope, b64bytes(stored));
      if (!bundle?.employers) return;
      const before = new Set(activityEvents().map(event => String(event?.id || '')).filter(Boolean));
      envelopeRevision = revision;
      state.data = bundle.employers;
      if (typeof renderSummary === 'function') renderSummary();
      if (typeof renderSourceFilter === 'function') renderSourceFilter();
      if (typeof renderCurrentView === 'function') renderCurrentView();
      renderActivity();
      observeNewActivity(before);
    } catch (_) {
      // Live refresh is a presentation enhancement; never destabilize the page.
    }
  }

  function installInteractionCancellation() {
    document.addEventListener('pointerdown', event => {
      if (event.isTrusted && event.target.closest('#employer-advanced .sphere-stage')) cancelJourney();
    }, true);
    document.addEventListener('wheel', event => {
      if (event.isTrusted && event.target.closest('#employer-advanced .sphere-stage')) cancelJourney();
    }, { capture: true, passive: true });
    document.addEventListener('keydown', event => {
      if (event.isTrusted && sphereActive() && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-'].includes(event.key)) cancelJourney();
    }, true);
  }

  function bootWhenReady() {
    if (initialised) return;
    if (typeof state === 'undefined' || !state.data) { setTimeout(bootWhenReady, 200); return; }
    initialised = true;
    installStyles();
    ensureActivityPanel();
    renderActivity();
    activityEvents().forEach(event => { if (event?.id) seenEventIds.add(String(event.id)); });
    installInteractionCancellation();
    document.getElementById('view-sphere')?.addEventListener('click', () => setTimeout(() => { ensureAutoSpin(); drainJourneyQueue(); }, 500));
    setInterval(pollForUpdate, POLL_MS);
    pollForUpdate();
  }

  bootWhenReady();
})();
