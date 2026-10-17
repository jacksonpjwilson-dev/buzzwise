// Small build label in the corner of every page (from /version)
fetch('/version').then(r => r.json()).then(v => { const d = document.createElement('div'); d.id = 'bw-version'; d.textContent = v.label;
  d.style.cssText = 'position:fixed;right:8px;bottom:6px;font:11px/1.2 system-ui,sans-serif;color:rgba(255,255,255,.45);z-index:9999;pointer-events:none';
  document.body.appendChild(d); }).catch(() => {});
