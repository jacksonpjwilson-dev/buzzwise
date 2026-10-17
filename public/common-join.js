// Shared join helpers for every /play page: never auto-rejoin from storage unless the URL carries that code.
window.BWJ = {
  isStale: err => /^No .*game with that code/i.test(err || ''),
  rejoinHtml: saved => saved ? `<button type="button" id="rj" class="btn btn-ghost btn-sm">↩ Rejoin ${esc(saved.code)} as ${esc(saved.name)}</button>` : '',
  // hide the Rejoin button and forget the saved session if that game no longer exists
  verify(game, key, saved, onGone) {
    if (!saved) return;
    fetch(`/api/exists?game=${game}&code=${encodeURIComponent(saved.code)}`).then(r => r.json()).then(j => { if (!j.exists) { localStorage.removeItem(key); onGone(); } }).catch(() => {});
  },
};
