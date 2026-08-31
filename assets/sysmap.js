(() => {
  const canvas = document.getElementById('sysmap-canvas');
  const detail = document.getElementById('sysmap-detail');
  const summary = document.getElementById('sysmap-summary');
  const patternList = document.getElementById('sysmap-pattern-list');
  const showHistorical = document.getElementById('sysmap-show-historical');
  const showLabels = document.getElementById('sysmap-show-labels');
  if (!canvas || !detail || !summary || !patternList) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const maturityCurrent = new Set(['repeated','reusable','canonical']);
  const layout = {
    source_acquisition:[18,26,29,28], canonical_identity:[38,28,31,31], careers_research:[31,58,28,29],
    organisation_assessment:[52,58,29,29], match_alignment:[70,53,27,27], publication:[64,25,28,28],
    review_observability:[78,73,30,27], supervisor_control:[22,78,28,25], public_ui:[82,29,30,28]
  };

  let graph;
  let selectedId = null;

  const visibleComponent = c => showHistorical?.checked || maturityCurrent.has(c.maturity);

  function nodePosition(component, indexInArea, totalInArea) {
    const spec = layout[component.primary_area] || [50,50,28,28];
    const [cx, cy, w, h] = spec;
    const angle = ((indexInArea / Math.max(totalInArea, 1)) * Math.PI * 2) - Math.PI / 2;
    const radiusX = Math.max(5, w * .28);
    const radiusY = Math.max(5, h * .28);
    return [cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY];
  }

  function render() {
    if (!graph) return;
    canvas.innerHTML = '';
    const positions = new Map();

    for (const area of graph.areas) {
      const [cx, cy, w, h] = layout[area.id] || [50,50,28,28];
      const ellipse = document.createElement('div');
      ellipse.className = 'sysmap-area';
      ellipse.style.left = `${cx - w/2}%`;
      ellipse.style.top = `${cy - h/2}%`;
      ellipse.style.width = `${w}%`;
      ellipse.style.height = `${h}%`;
      ellipse.title = area.summary || area.name;
      canvas.appendChild(ellipse);
      const label = document.createElement('div');
      label.className = 'sysmap-area-label';
      label.textContent = area.name;
      label.style.left = `${cx - w/2 + 1}%`;
      label.style.top = `${cy - h/2 + 1}%`;
      canvas.appendChild(label);
    }

    const grouped = new Map();
    for (const component of graph.components.filter(visibleComponent)) {
      const list = grouped.get(component.primary_area) || [];
      list.push(component);
      grouped.set(component.primary_area, list);
    }

    for (const [areaId, components] of grouped) {
      components.forEach((component, index) => {
        positions.set(component.id, nodePosition(component, index, components.length));
      });
    }

    for (const rel of graph.relationships) {
      const from = positions.get(rel.from), to = positions.get(rel.to);
      if (!from || !to) continue;
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const edge = document.createElement('div');
      edge.className = 'sysmap-edge';
      edge.style.left = `${from[0]}%`;
      edge.style.top = `${from[1]}%`;
      edge.style.width = `${length}%`;
      edge.style.transform = `rotate(${angle}deg)`;
      canvas.appendChild(edge);
      if (showLabels?.checked) {
        const label = document.createElement('div');
        label.className = 'sysmap-edge-label';
        label.textContent = rel.type.replaceAll('_',' ');
        label.style.left = `${(from[0]+to[0])/2}%`;
        label.style.top = `${(from[1]+to[1])/2}%`;
        canvas.appendChild(label);
      }
    }

    for (const component of graph.components.filter(visibleComponent)) {
      const pos = positions.get(component.id);
      if (!pos) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sysmap-node${component.id === selectedId ? ' selected' : ''}`;
      button.dataset.maturity = component.maturity;
      button.style.left = `${pos[0]}%`;
      button.style.top = `${pos[1]}%`;
      button.innerHTML = `<div class="sysmap-node-name">${escapeHtml(component.name)}</div><div class="sysmap-node-meta">${escapeHtml(component.kind)} · ${escapeHtml(component.maturity)}</div>`;
      button.title = component.summary || component.name;
      button.addEventListener('click', () => selectComponent(component.id));
      canvas.appendChild(button);
    }
  }

  function selectComponent(id) {
    selectedId = id;
    const c = graph.components.find(item => item.id === id);
    if (!c) return;
    const incoming = graph.relationships.filter(r => r.to === id);
    const outgoing = graph.relationships.filter(r => r.from === id);
    const evidence = Object.entries(c.evidence_counts || {}).map(([k,v]) => `<span class="sysmap-chip">${escapeHtml(k)} ${escapeHtml(v)}</span>`).join('');
    const linkHtml = (c.public_links || []).map(item => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label || item.url)}</a></li>`).join('');
    const relRows = [...incoming.map(r => `${r.from} → <strong>${id}</strong> · ${r.type}`), ...outgoing.map(r => `<strong>${id}</strong> → ${r.to} · ${r.type}`)];
    detail.innerHTML = `
      <p class="eyebrow">${escapeHtml(c.kind)}</p>
      <h2>${escapeHtml(c.name)}</h2>
      <p>${escapeHtml(c.summary)}</p>
      <dl>
        <dt>Maturity</dt><dd>${escapeHtml(c.maturity)}</dd>
        <dt>Authority</dt><dd>${escapeHtml(c.authority)}</dd>
        <dt>Primary area</dt><dd>${escapeHtml(c.primary_area)}</dd>
        <dt>Overlaps</dt><dd>${escapeHtml((c.overlaps || []).join(', ') || 'none')}</dd>
      </dl>
      ${evidence ? `<div class="sysmap-evidence">${evidence}</div>` : ''}
      ${relRows.length ? `<h3>Relationships</h3><ul class="sysmap-detail-list">${relRows.map(v => `<li>${v}</li>`).join('')}</ul>` : ''}
      ${linkHtml ? `<h3>Public links</h3><ul class="sysmap-detail-list">${linkHtml}</ul>` : ''}`;
    render();
  }

  function renderPatterns() {
    patternList.innerHTML = graph.process_patterns.map(pattern => `
      <article class="sysmap-pattern" data-maturity="${escapeHtml(pattern.maturity)}">
        <h3>${escapeHtml(pattern.name)}</h3>
        <p>${escapeHtml(pattern.summary)}</p>
        <ol>${(pattern.stages || []).map(stage => `<li>${escapeHtml(stage)}</li>`).join('')}</ol>
      </article>`).join('');
  }

  Promise.all([
    fetch('./system-map.json', {cache:'no-store'}).then(r => { if (!r.ok) throw new Error(`system-map ${r.status}`); return r.json(); }),
    fetch('./summary.json', {cache:'no-store'}).then(r => { if (!r.ok) throw new Error(`summary ${r.status}`); return r.json(); })
  ]).then(([map, build]) => {
    graph = map;
    summary.textContent = `${map.counts.areas} areas · ${map.counts.components} components · ${map.counts.relationships} relationships · ${map.counts.process_patterns} patterns · ${build.model_digest.slice(0,12)}`;
    renderPatterns();
    render();
  }).catch(error => {
    console.error(error);
    summary.textContent = 'SysMap failed to load.';
    detail.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  });

  showHistorical?.addEventListener('change', render);
  showLabels?.addEventListener('change', render);
})();
