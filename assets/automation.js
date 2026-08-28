const target = document.getElementById('automation-status');

function escapeHtml(value) {
  return String(value ?? 'unknown').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function metric(label, value) {
  return `<div class="metric"><span class="metric-value">${escapeHtml(value)}</span><span class="metric-label">${escapeHtml(label)}</span></div>`;
}

function windowLabel(minutes) {
  if (minutes === 300) return '5-hour limit';
  if (minutes === 10080) return 'Weekly limit';
  if (minutes === 1440) return 'Daily limit';
  if (Number.isFinite(minutes)) return `${minutes}-minute limit`;
  return 'Usage limit';
}

function resetLabel(timestamp) {
  if (!Number.isFinite(timestamp)) return 'reset time unavailable';
  return `resets ${new Date(timestamp * 1000).toLocaleString()}`;
}

function quotaRow(bucket, window) {
  const prefix = bucket.limit_name && bucket.limit_name !== 'codex' ? `${bucket.limit_name} · ` : '';
  const remaining = Number(window.remaining_percent);
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, Math.min(100, remaining)) : 0;
  return `
    <div class="quota-row">
      <div class="quota-head">
        <strong>${escapeHtml(prefix + windowLabel(Number(window.window_duration_mins)))}</strong>
        <span>${escapeHtml(`${safeRemaining}% left`)}</span>
      </div>
      <progress max="100" value="${safeRemaining}" aria-label="${escapeHtml(prefix + windowLabel(Number(window.window_duration_mins)))}"></progress>
      <div class="subtle quota-reset">${escapeHtml(resetLabel(Number(window.resets_at)))}</div>
    </div>`;
}

function quotaSection(rateLimits) {
  if (!rateLimits || rateLimits.status === 'not_checked') {
    return '<div class="notice">Usage limits have not been checked yet.</div>';
  }
  if (rateLimits.status === 'unavailable') {
    return '<div class="notice">Codex usage limits are currently unavailable.</div>';
  }

  const rows = [];
  for (const bucket of rateLimits.limits || []) {
    if (bucket.primary) rows.push(quotaRow(bucket, bucket.primary));
    if (bucket.secondary) rows.push(quotaRow(bucket, bucket.secondary));
  }

  if (!rows.length) return '<div class="notice">No Codex quota windows were returned.</div>';

  const resetCredits = Number.isFinite(Number(rateLimits.available_reset_credits))
    ? `<p class="subtle quota-credits">Available reset credits: ${escapeHtml(rateLimits.available_reset_credits)}</p>`
    : '';

  return `
    <section class="quota-section" aria-label="Codex usage limits">
      <p class="eyebrow">Usage limits</p>
      ${rows.join('')}
      ${resetCredits}
    </section>`;
}

function researchSection(research) {
  const status = research?.status || 'idle';
  const url = research?.job_url;
  const allowedUrl = typeof url === 'string' && /^https:\/\/github\.com\/0xF00115h\/jobsearch\/actions\/runs\/\d+\/job\/\d+$/.test(url);
  const link = allowedUrl
    ? `<a class="pill-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open live research log</a>`
    : '<span class="subtle">No research job is currently running.</span>';

  return `
    <section class="resource-card" aria-label="Employer research run">
      <p class="eyebrow">Employer research</p>
      <h3>${escapeHtml(status === 'in_progress' ? 'running' : status)}</h3>
      <div class="links">${link}</div>
    </section>`;
}

fetch('../automation.json', { cache: 'no-store' })
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    const result = data.result === 'success' ? 'healthy' : data.result === 'failure' ? 'failed' : 'not checked';
    const configuredModel = data.configured_model || data.model;
    target.innerHTML = `
      <div class="landscape-heading">
        <div>
          <p class="eyebrow">Codex runner</p>
          <h2>${escapeHtml(result)}</h2>
          <p class="subtle">Last check: ${escapeHtml(data.checked_at)}</p>
        </div>
        <div class="status">${escapeHtml(data.result)}</div>
      </div>
      ${researchSection(data.research)}
      <div class="metric-grid">
        ${metric('Effective model', data.model)}
        ${metric('Configured model', configuredModel)}
        ${metric('Codex CLI', data.codex_cli)}
        ${metric('Authentication', data.authentication)}
      </div>
      ${quotaSection(data.rate_limits)}
      <div class="notice">${escapeHtml(data.boundary || '')}</div>
    `;
  })
  .catch(error => {
    target.innerHTML = `<div class="empty-state">Could not load automation status: ${escapeHtml(error.message)}</div>`;
  });
