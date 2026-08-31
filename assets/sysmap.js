(() => {
  const canvas = document.getElementById('sysmap-canvas');
  const detail = document.getElementById('sysmap-detail');
  const summary = document.getElementById('sysmap-summary');
  const patternList = document.getElementById('sysmap-pattern-list');
  const showHistorical = document.getElementById('sysmap-show-historical');
  const showLabels = document.getElementById('sysmap-show-labels');
  const showAllRelationships = document.getElementById('sysmap-show-all-relationships');
  if (!canvas || !detail || !summary || !patternList) return;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const maturityCurrent = new Set(['repeated','reusable','canonical']);
  let graph;
  let selectedId = null;

  const visibleComponent = c => showHistorical?.checked || maturityCurrent.has(c.maturity);

  function modelToPercent(x, y) {
    const width = graph.layout?.canvas?.width || 1600;
    const height = graph.layout?.canvas?.height || 980;
    return [x / width * 100, y / height * 100];
  }

  function componentPosition(component) {
    const spec = graph.layout?.components?.[component.id];
    if (spec) return modelToPercent(spec.x, spec.y);
    const area = graph.layout?.areas?.[component.primary_area];
    return area ? modelToPercent(area.x, area.y) : [50, 50];
  }

  function relationshipVisible(rel, visibleIds) {
    if (!visibleIds.has(rel.from) || !visibleIds.has(rel.to)) return false;
    if (showAllRelationships?.checked) return true;
    if (selectedId && (rel.from === selectedId || rel.to === selectedId)) return true;
    return new Set(graph.layout?.backbone_relationships || []).has(rel.id);
  }

  function render() {
    if (!graph) return;
    canvas.innerHTML = '';
    const positions = new Map();
    const visible = graph.components.filter(visibleComponent);
    const visibleIds = new Set(visible.map(c => c.id));

    for (const area of graph.areas) {
      const spec = graph.layout?.areas?.[area.id];
      if (!spec) continue;
      const [cx, cy] = modelToPercent(spec.x, spec.y);
      const [w] = modelToPercent(spec.w, 0);
      const [, h] = modelToPercent(0, spec.h);
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
      label.style.left = `${cx - w/2 + .8}%`;
      label.style.top = `${cy - h/2 + 1.1}%`;
      canvas.appendChild(label);
    }

    for (const component of visible) positions.set(component.id, componentPosition(component));

    for (const rel of graph.relationships) {
      if (!relationshipVisible(rel, visibleIds)) continue;
      const from = positions.get(rel.from), to = positions.get(rel.to);
      if (!from || !to) continue;
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const connected = selectedId && (rel.from === selectedId || rel.to === selectedId);
      const edge = document.createElement('div');
      edge.className = `sysmap-edge${connected ? ' active' : ''}`;
      edge.style.left = `${from[0]}%`;
      edge.style.top = `${from[1]}%`;
      edge.style.width = `${length}%`;
      edge.style.transform = `rotate(${angle}deg)`;
      canvas.appendChild(edge);
      if (showLabels?.checked && (connected || showAllRelationships?.checked)) {
        const label = document.createElement('div');
        label.className = `sysmap-edge-label${connected ? ' active' : ''}`;
        label.textContent = rel.type.replaceAll('_',' ');
        label.style.left = `${(from[0]+to[0])/2}%`;
        label.style.top = `${(from[1]+to[1])/2}%`;
        canvas.appendChild(label);
      }
    }

    for (const component of visible) {
      const pos = positions.get(component.id);
      const spec = graph.layout?.components?.[component.id] || {};
      const level = Number(spec.level ?? 1);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sysmap-node level-${level}${component.id === selectedId ? ' selected' : ''}`;
      button.dataset.maturity = component.maturity;
      button.style.left = `${pos[0]}%`;
      button.style.top = `${pos[1]}%`;
      if (spec.width) button.style.width = `${spec.width}px`;
      button.innerHTML = `<div class="sysmap-node-name">${escapeHtml(component.name)}</div><div class="sysmap-node-meta">${escapeHtml(component.kind)} · ${escapeHtml(component.maturity)}</div>`;
      button.title = component.summary || component.name;
      button.addEventListener('click', () => selectComponent(component.id));
      canvas.appendChild(button);
    }
  }

  function selectComponent(id) {
    selectedId = selectedId === id ? null : id;
    if (!selectedId) {
      detail.innerHTML = '<div class="empty-state">Select a component to inspect its role, maturity and relationships.</div>';
      render();
      return;
    }
    const c = graph.components.find(item => item.id === selectedId);
    if (!c) return;
    const incoming = graph.relationships.filter(r => r.to === selectedId);
    const outgoing = graph.relationships.filter(r => r.from === selectedId);
    const evidence = Object.entries(c.evidence_counts || {}).map(([k,v]) => `<span class="sysmap-chip">${escapeHtml(k)} ${escapeHtml(v)}</span>`).join('');
    const linkHtml = (c.public_links || []).map(item => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label || item.url)}</a></li>`).join('');
    const relRows = [...incoming.map(r => `${r.from} → <strong>${selectedId}</strong> · ${r.type}`), ...outgoing.map(r => `<strong>${selectedId}</strong> → ${r.to} · ${r.type}`)];
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
    if (showLabels) showLabels.checked = Boolean(map.visual_defaults?.show_relationship_labels);
    if (showAllRelationships) showAllRelationships.checked = !Boolean(map.visual_defaults?.backbone_only);
    summary.textContent = `${map.counts.areas} areas · ${map.counts.components} components · ${map.counts.relationships} relationships · layout v${build.layout_version || 1} · ${build.model_digest.slice(0,12)}`;
    renderPatterns();
    render();
  }).catch(error => {
    console.error(error);
    summary.textContent = 'SysMap failed to load.';
    detail.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  });

  showHistorical?.addEventListener('change', render);
  showLabels?.addEventListener('change', render);
  showAllRelationships?.addEventListener('change', render);
})();
