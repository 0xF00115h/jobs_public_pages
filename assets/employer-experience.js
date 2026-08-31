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
(() => {
  'use strict';

  document.addEventListener('dblclick', event => {
    if (event.isTrusted) return;
    const card = event.target.closest?.('#employer-advanced .sphere-employer[data-employer-canonical-id]');
    if (!card) return;
    const api = window.EmployerSphere?.current;
    if (!api?.navigateCanonicalId) return;
    api.navigateCanonicalId(card.dataset.employerCanonicalId, { select: true });
  }, true);
})();
(() => {
  'use strict';

  const DEFAULT_LINGER_MS = 2400;
  let token = 0;
  let running = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sphereActive = () => document.getElementById('view-sphere')?.getAttribute('aria-pressed') === 'true';
  const canonicalId = value => /^ce_[a-f0-9]{32}$/.test(String(value || '')) ? String(value) : null;

  function filteredIds() {
    if (typeof filteredEmployers !== 'function') return [];
    const seen = new Set();
    const ids = [];
    for (const employer of filteredEmployers()) {
      const id = canonicalId(employer?.canonical_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function selectedCanonicalId() {
    return canonicalId(document.querySelector('#employer-advanced .sphere-employer.selected[data-employer-canonical-id]')?.dataset.employerCanonicalId);
  }

  function focusCard(id, active) {
    const card = [...document.querySelectorAll('#employer-advanced .sphere-employer[data-employer-canonical-id]')]
      .find(node => node.dataset.employerCanonicalId === id);
    if (card) card.classList.toggle('journey-focus', active);
    return card;
  }

  function clearFocus() {
    document.querySelectorAll('#employer-advanced .sphere-employer.journey-focus').forEach(card => card.classList.remove('journey-focus'));
  }

  function setStatus(text) {
    const status = document.getElementById('filtered-replay-status');
    if (status) status.textContent = text;
  }

  function updateButton() {
    const button = document.getElementById('replay-filtered-employers');
    const count = filteredIds().length;
    if (button) {
      button.disabled = count === 0;
      button.textContent = running ? 'Cancel replay' : `Replay visible (${count})`;
    }
    document.querySelectorAll('.sphere-filter-step').forEach(control => {
      control.disabled = count === 0;
      control.setAttribute('aria-label', `${control.dataset.direction === 'prev' ? 'Previous' : 'Next'} employer in current filtered set (${count})`);
    });
    if (!running) setStatus(count ? 'Current filtered set' : 'No canonical employers visible');
  }

  function cancel({ restoreSpin = true } = {}) {
    token += 1;
    running = false;
    clearFocus();
    window.EmployerJourneys?.cancel?.();
    const api = window.EmployerSphere?.current;
    api?.cancelNavigation?.();
    if (restoreSpin && sphereActive()) api?.setAutoSpin?.(true, 1);
    updateButton();
  }

  async function waitForSphereApi(currentToken) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (currentToken !== token) return null;
      const api = window.EmployerSphere?.current;
      if (sphereActive() && api?.navigateCanonicalId) return api;
      await sleep(100);
    }
    return null;
  }

  async function play(ids, options = {}) {
    const unique = [];
    const seen = new Set();
    for (const value of Array.isArray(ids) ? ids : []) {
      const id = canonicalId(typeof value === 'string' ? value : value?.canonical_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(id);
    }
    if (!unique.length) return false;

    cancel({ restoreSpin: false });
    const currentToken = token;
    running = true;
    updateButton();

    if (!sphereActive()) {
      document.getElementById('view-sphere')?.click();
      await sleep(350);
    }

    await sleep(220);
    const api = await waitForSphereApi(currentToken);
    if (!api || currentToken !== token) {
      running = false;
      setStatus('Sphere navigation unavailable');
      updateButton();
      return false;
    }

    api.setAutoSpin?.(false);
    const lingerMs = Math.max(700, Number(options.linger_ms) || DEFAULT_LINGER_MS);

    for (let index = 0; index < unique.length; index += 1) {
      if (currentToken !== token) return false;
      const id = unique[index];
      const card = focusCard(id, false);
      if (!card || card.classList.contains('filtered')) continue;
      clearFocus();
      api.setAutoSpin?.(false);
      const nav = api.navigateCanonicalId(id, { select: true });
      if (!nav) continue;
      setStatus(`${index + 1} / ${unique.length}`);
      await sleep(Math.max(250, Number(nav.duration) || 1100) + 120);
      if (currentToken !== token) return false;
      focusCard(id, true);
      api.setAutoSpin?.(true, 0.10);
      await sleep(lingerMs);
      api.setAutoSpin?.(false);
    }

    if (currentToken === token) {
      clearFocus();
      running = false;
      setStatus(`Complete · ${unique.length} employers`);
      api.setAutoSpin?.(true, 1);
      updateButton();
    }
    return true;
  }

  async function stepFiltered(direction) {
    const ids = filteredIds();
    if (!ids.length || !sphereActive()) return false;

    cancel({ restoreSpin: false });
    const currentToken = token;
    await sleep(220);
    const api = await waitForSphereApi(currentToken);
    if (!api || currentToken !== token) return false;

    const current = selectedCanonicalId();
    const index = current ? ids.indexOf(current) : -1;
    const targetIndex = index < 0
      ? (direction < 0 ? ids.length - 1 : 0)
      : (index + (direction < 0 ? -1 : 1) + ids.length) % ids.length;

    api.setAutoSpin?.(false);
    const nav = api.navigateCanonicalId(ids[targetIndex], { select: true });
    if (!nav) return false;
    setStatus(`${targetIndex + 1} / ${ids.length} · manual`);
    updateButton();
    return true;
  }

  function playCurrentFiltered() {
    const ids = filteredIds();
    if (!ids.length) return false;
    play(ids, { linger_ms: DEFAULT_LINGER_MS });
    return true;
  }

  function installControl() {
    const select = document.getElementById('jobs-filter');
    const label = select?.closest('label.source-filter');
    if (!select || !label || document.getElementById('replay-filtered-employers')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'source-filter filtered-replay-control';
    label.replaceWith(wrapper);
    label.classList.remove('source-filter');
    wrapper.appendChild(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'replay-filtered-employers';
    button.className = 'landscape-view-button filtered-replay-button';
    button.addEventListener('click', () => running ? cancel() : playCurrentFiltered());
    wrapper.appendChild(button);
    const status = document.createElement('span');
    status.id = 'filtered-replay-status';
    status.className = 'subtle filtered-replay-status';
    wrapper.appendChild(status);
    document.getElementById('employer-search')?.addEventListener('input', updateButton);
    document.getElementById('source-filter')?.addEventListener('change', updateButton);
    document.getElementById('scope-filter')?.addEventListener('change', updateButton);
    select.addEventListener('change', updateButton);
  }

  function installSphereStepControls() {
    const stage = document.querySelector('#employer-advanced .sphere-stage');
    if (!stage || stage.querySelector('.sphere-filter-step-controls')) return false;
    const controls = document.createElement('div');
    controls.className = 'sphere-filter-step-controls';
    controls.setAttribute('aria-label', 'Step through current filtered employers');
    controls.innerHTML = '<button type="button" class="sphere-control sphere-filter-step" data-direction="prev" title="Previous visible employer">‹</button><button type="button" class="sphere-control sphere-filter-step" data-direction="next" title="Next visible employer">›</button>';
    controls.addEventListener('pointerdown', event => event.stopPropagation());
    controls.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    controls.querySelector('[data-direction="prev"]')?.addEventListener('click', event => { event.stopPropagation(); stepFiltered(-1); });
    controls.querySelector('[data-direction="next"]')?.addEventListener('click', event => { event.stopPropagation(); stepFiltered(1); });
    stage.appendChild(controls);
    return true;
  }

  function installStyles() {
    if (document.getElementById('employer-sequence-player-style')) return;
    const style = document.createElement('style');
    style.id = 'employer-sequence-player-style';
    style.textContent = '.filtered-replay-control>label{display:block}.filtered-replay-button{display:block;width:100%;margin-top:7px;padding:7px 9px;cursor:pointer}.filtered-replay-button:disabled{opacity:.45;cursor:default}.filtered-replay-status{display:block;margin-top:4px;font-size:10px;line-height:1.2}.sphere-filter-step-controls{position:absolute;right:360px;top:50%;transform:translateY(-50%);display:flex;gap:5px;z-index:11;pointer-events:auto}.sphere-filter-step{min-width:34px;height:40px;padding:4px 9px;font-size:24px;line-height:1;border-radius:9px;background:rgba(13,17,23,.9);backdrop-filter:blur(4px)}.sphere-filter-step:disabled{opacity:.35;cursor:default}@media(max-width:900px){.sphere-filter-step-controls{right:12px;top:auto;bottom:12px;transform:none}}@media(max-width:760px){.sphere-filter-step{min-width:32px;height:38px;font-size:22px}}';
    document.head.appendChild(style);
  }

  window.EmployerSequencePlayer = {
    play,
    cancel,
    playCurrentFiltered,
    stepFiltered,
    currentFilteredIds: filteredIds,
    get active() { return running; },
  };

  function boot() {
    if (typeof filteredEmployers !== 'function' || !document.getElementById('jobs-filter')) {
      setTimeout(boot, 100);
      return;
    }
    installStyles();
    installControl();
    if (!installSphereStepControls()) setTimeout(boot, 150);
    updateButton();
  }

  boot();
})();
