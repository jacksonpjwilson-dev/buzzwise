// Test helper for the older flow tests: after any round-starting host event, press the 'Get ready' Start (host:go)
// automatically. The gate itself is tested explicitly in test-getready.js (which does NOT load this).
const { Socket } = require('socket.io-client');
const STARTERS = new Set(['host:start', 'host:nextRound', 'host:startRound', 'host:next', 'host:row', 'host:game', 'host:showdown', 'host:final']);
const orig = Socket.prototype.emit;
Socket.prototype.emit = function (ev, ...args) { const r = orig.call(this, ev, ...args); if (STARTERS.has(ev)) orig.call(this, 'host:go', {}); return r; };
