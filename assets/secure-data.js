(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const scriptUrl = document.currentScript?.src || new URL('assets/secure-data.js', location.href).href;
  const encryptedUrl = new URL('../site-data.enc.json', scriptUrl).href;
  const AAD = new TextEncoder().encode('jobsearch-public-pages:v1');
  const SESSION_KEY = 'jobsearch-site-key-v1';
  const protectedNames = new Map([
    ['jobs.json', 'jobs'],
    ['employers.json', 'employers'],
    ['automation.json', 'automation'],
  ]);

  let bundlePromise = null;

  function base64UrlBytes(value) {
    const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = text + '='.repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }

  function bytesBase64Url(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function requestKey(keyId, message = '') {
    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(5,8,12,.94);display:grid;place-items:center;padding:24px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d8dee9';
      const panel = document.createElement('form');
      panel.style.cssText = 'width:min(520px,100%);border:1px solid #30363d;background:#0d1117;padding:22px;box-shadow:0 20px 70px rgba(0,0,0,.45)';
      panel.innerHTML = `
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8b949e;margin-bottom:8px">Encrypted site</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:7px">Unlock data</div>
        <div style="font-size:12px;line-height:1.5;color:#8b949e;margin-bottom:16px">Paste the local 256-bit site key. After a successful unlock it is retained only for this browser tab/session.</div>
        <input name="key" type="password" autocomplete="off" spellcheck="false" aria-label="Site key" style="box-sizing:border-box;width:100%;background:#010409;color:#e6edf3;border:1px solid #30363d;padding:10px 11px;font:inherit;outline:none" />
        <div data-error style="min-height:18px;margin-top:8px;font-size:11px;color:#f85149">${message}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:8px"><span style="font-size:10px;color:#6e7681">${String(keyId || 'site-key-v1')}</span><button type="submit" style="background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:8px 13px;font:inherit;cursor:pointer">Unlock</button></div>`;
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      const input = panel.elements.key;
      const error = panel.querySelector('[data-error]');
      setTimeout(() => input.focus(), 0);
      panel.addEventListener('submit', event => {
        event.preventDefault();
        try {
          const key = base64UrlBytes(input.value.trim());
          if (key.length !== 32) throw new Error('Key must decode to 32 bytes.');
          overlay.remove();
          resolve(key);
        } catch (err) {
          error.textContent = err.message || 'Invalid key.';
          input.select();
        }
      });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          overlay.remove();
          reject(new Error('Unlock cancelled'));
        }
      });
    });
  }

  async function tryDecrypt(envelope, rawKey) {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlBytes(envelope.iv), additionalData: AAD, tagLength: 128 },
      key,
      base64UrlBytes(envelope.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async function decryptEnvelope(envelope) {
    if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Unsupported encrypted payload');
    let errorMessage = '';
    let stored = null;
    try { stored = sessionStorage.getItem(SESSION_KEY); } catch (_) {}

    while (true) {
      let rawKey = null;
      if (stored) {
        try { rawKey = base64UrlBytes(stored); } catch (_) {}
        stored = null;
      }
      if (!rawKey || rawKey.length !== 32) rawKey = await requestKey(envelope.key_id, errorMessage);
      try {
        const bundle = await tryDecrypt(envelope, rawKey);
        try { sessionStorage.setItem(SESSION_KEY, bytesBase64Url(rawKey)); } catch (_) {}
        return bundle;
      } catch (_) {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
        errorMessage = 'Incorrect key. Nothing was decrypted; try again.';
      }
    }
  }

  async function loadBundle() {
    const response = await nativeFetch(encryptedUrl, { cache: 'no-store' });
    if (response.status === 404) return null; // Temporary migration compatibility; remove after encrypted cutover.
    if (!response.ok) throw new Error(`Could not load encrypted site data: HTTP ${response.status}`);
    return decryptEnvelope(await response.json());
  }

  function requestedProtectedName(input) {
    const href = typeof input === 'string' ? input : input?.url;
    if (!href) return null;
    let pathname;
    try { pathname = new URL(href, location.href).pathname; } catch (_) { return null; }
    const filename = pathname.split('/').pop();
    return protectedNames.get(filename) || null;
  }

  window.fetch = async function secureFetch(input, init) {
    const dataName = requestedProtectedName(input);
    if (!dataName) return nativeFetch(input, init);
    if (!bundlePromise) bundlePromise = loadBundle();
    const bundle = await bundlePromise;
    if (bundle === null) return nativeFetch(input, init); // Temporary migration compatibility.
    if (!(dataName in bundle)) return new Response('', { status: 404, statusText: 'Not Found' });
    return new Response(JSON.stringify(bundle[dataName]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  };
})();
