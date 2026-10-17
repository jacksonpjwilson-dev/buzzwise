// 'Get ready' gate shared by every mode: before a round/face-off/turn the shared screen and phones only see who's up
// and the scores. NO question, puzzle, item, word or speech is sent until the host presses Start (host:go).
const HOST_OK = new Set(['host:go', 'host:create', 'host:mode', 'host:adjust', 'host:kick', 'host:newGame', 'host:settings', 'host:skipRound']);
function gate(room, title, lines, after) { room.getReady = { title, lines: lines.filter(Boolean) }; room.afterGo = after || null; }
function view(room, scores) { return { code: room.code, phase: 'getready', getReady: room.getReady, scores, message: room.getReady.title, hostMode: room.hostMode, now: Date.now() }; }
function go(room) { if (!room || !room.getReady) return false; const f = room.afterGo; room.getReady = null; room.afterGo = null; if (f) f(); return true; }
// socket middleware: while gated, block player actions and game-advancing host actions
function guard(socket, findRoom) {
  socket.use((packet, next) => { const ev = packet[0]; const room = findRoom(ev); if (room && room.getReady && ((ev.startsWith('player:') && ev !== 'player:join') || (ev.startsWith('host:') && !HOST_OK.has(ev)))) {
    const cb = packet[packet.length - 1]; if (typeof cb === 'function') cb({ error: 'Waiting for the host to press Start' }); return; } next(); });
}
module.exports = { gate, view, go, guard };
