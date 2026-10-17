// Shared room framework for the newer party modes (Password, Cards Against Everyone, Priorities).
// Every client gets its OWN view (hostView / playerView), so secrets only reach the right phone.
const GR = require('./getready');
module.exports = function makeParty(io, makeCode, ns, game) {
  const nsp = io.of(ns); const rooms = {};
  const send = room => {
    if (room.getReady) { const v = { ...GR.view(room, Object.values(room.players).map(p => ({ name: p.name, score: p.score })).sort((a, b) => b.score - a.score)) };
      if (room.hostSocket) nsp.to(room.hostSocket).emit('state', v); for (const p of Object.values(room.players)) if (p.socketId) nsp.to(p.socketId).emit('state', { ...v, me: { id: p.id, name: p.name, score: p.score } }); return; }
    if (room.hostSocket) nsp.to(room.hostSocket).emit('state', { ...base(room), ...game.hostView(room) });
    for (const p of Object.values(room.players)) if (p.socketId) nsp.to(p.socketId).emit('state', { ...base(room), me: { id: p.id, name: p.name, score: p.score }, ...game.playerView(room, p.id) });
  };
  const base = room => ({ code: room.code, phase: room.phase, message: room.message, hostMode: room.hostMode, now: Date.now(),
    players: Object.values(room.players).map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })) });
  const api = { nsp, rooms, broadcast: send, gate: GR.gate, emitAll: (room, ev, d) => nsp.to(room.code).emit(ev, d) };
  nsp.on('connection', socket => {
    const hostRoom = () => { const r = rooms[socket.data.hostCode]; return r && r.hostSocket === socket.id ? r : null; };
    const me = () => { const r = rooms[socket.data.code]; return r && r.players[socket.data.pid] ? r : null; };
    GR.guard(socket, ev => ev.startsWith('host:') ? rooms[socket.data.hostCode] : rooms[socket.data.code]);
    socket.on('host:go', (_, cb) => { const room = hostRoom(); const went = !!(room && GR.go(room)); if (went) send(room); if (typeof cb === 'function') cb(went ? { ok: true } : { error: 'Nothing to start' }); });
    const reply = (room, res, cb) => { if (res && res.error) socket.emit('errorMsg', res.error); if (typeof cb === 'function') cb(res || { ok: true }); if (room) send(room); };
    socket.on('host:create', (opts, cb) => {
      if (typeof opts === 'function') { cb = opts; opts = {}; } opts = opts || {}; const prev = rooms[opts.code];
      if (prev && prev.hostKey === opts.hostKey) { prev.hostSocket = socket.id; socket.data.hostCode = prev.code; socket.join(prev.code); cb && cb({ code: prev.code, hostKey: prev.hostKey }); return send(prev); }
      const c = makeCode(x => rooms[x]);
      const room = rooms[c] = { code: c, hostKey: Math.random().toString(36).slice(2), hostSocket: socket.id, players: {}, phase: 'lobby', hostMode: 'player', message: 'Players: join on your phones!', created: Date.now() };
      game.init(room, api); socket.data.hostCode = c; socket.join(c); cb && cb({ code: c, hostKey: room.hostKey }); send(room);
    });
    socket.on('host:mode', ({ mode } = {}, cb) => { const room = hostRoom(); if (!room) return;
      if (room.phase !== 'lobby' && room.phase !== 'gameOver') return reply(room, { error: 'Change the host mode between games' }, cb);
      room.hostMode = mode === 'dedicated' ? 'dedicated' : 'player'; reply(room, { ok: true }, cb); });
    socket.on('host:kick', ({ pid } = {}) => { const room = hostRoom(); if (!room || !room.players[pid]) return; const p = room.players[pid];
      if (p.socketId) nsp.to(p.socketId).emit('kicked'); delete room.players[pid]; game.onLeave && game.onLeave(room, pid, api); send(room); });
    socket.on('player:join', ({ code, name, pid } = {}, cb) => {
      code = String(code || '').trim().toUpperCase(); name = String(name || '').trim().slice(0, 14);
      const room = rooms[code]; if (!room) return cb && cb({ error: `No ${game.title} game with that code` });
      if (!name) return cb && cb({ error: 'Enter a name' });
      pid = String(pid || '').slice(0, 40) || Math.random().toString(36).slice(2);
      let p = room.players[pid];
      if (!p) { if (Object.values(room.players).some(x => x.name.toLowerCase() === name.toLowerCase())) return cb && cb({ error: 'That name is taken' });
        if (Object.keys(room.players).length >= (game.maxPlayers || 16)) return cb && cb({ error: 'Game is full' });
        p = room.players[pid] = { id: pid, name, score: 0, joinedAt: Date.now() }; game.onJoin && game.onJoin(room, p, api); }
      p.socketId = socket.id; p.connected = true; socket.data.code = code; socket.data.pid = pid; socket.join(code);
      cb && cb({ ok: true, pid, code }); send(room);
    });
    for (const [ev, fn] of Object.entries(game.host || {})) socket.on('host:' + ev, (d, cb) => { if (typeof d === 'function') { cb = d; d = {}; } const room = hostRoom(); if (!room) return; reply(room, fn(room, d || {}, api), cb); });
    for (const [ev, fn] of Object.entries(game.player || {})) socket.on('player:' + ev, (d, cb) => { if (typeof d === 'function') { cb = d; d = {}; } const room = me(); if (!room) return cb && cb({ error: 'Not in a game' }); reply(room, fn(room, socket.data.pid, d || {}, api), cb); });
    socket.on('disconnect', () => { const room = rooms[socket.data.code]; const p = room && room.players[socket.data.pid];
      if (p && p.socketId === socket.id) { p.connected = false; p.socketId = null; if (room.phase === 'lobby') { delete room.players[p.id]; game.onLeave && game.onLeave(room, p.id, api); } send(room); } });
  });
  setInterval(() => { const cut = Date.now() - 12 * 3600e3; for (const c in rooms) if (rooms[c].created < cut) delete rooms[c]; }, 3600e3).unref();
  return api;
};
module.exports.shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
