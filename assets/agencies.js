(() => {
  'use strict';

  const summary = document.getElementById('agency-summary');
  const grid = document.getElementById('agency-grid');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  async function load() {
    try {
      const response = await fetch('../agencies.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const agencies = Array.isArray(payload.agencies) ? payload.agencies : [];
      summary.textContent = `${agencies.length} canonical ${agencies.length === 1 ? 'agency' : 'agencies'}`;
      grid.innerHTML = agencies
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map(agency => {
          const name = escapeHtml(agency.name || agency.canonical_id || 'Agency');
          const homepage = String(agency.official_homepage || '').trim();
          const domain = escapeHtml(agency.canonical_domain || homepage || '');
          const link = homepage
            ? `<a class="pill-link" href="${escapeHtml(homepage)}" target="_blank" rel="noopener noreferrer">${domain || 'Website'}</a>`
            : '<span class="subtle">Website not recorded</span>';
          return `<article class="employer-card"><h2>${name}</h2><div class="links">${link}</div></article>`;
        })
        .join('');
    } catch (error) {
      summary.textContent = `Could not load agencies: ${error.message || error}`;
    }
  }

  load();
})();
