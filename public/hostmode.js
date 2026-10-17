// Shared 'Who is hosting?' toggle used on every game's host screen.
function hostModeToggle(mode, ev, txt) {
  txt = txt || {}; return `<div class="card hosttoggle"><b>Who is hosting?</b><div class="tabs" style="margin:8px 0">
  <button class="tab ${mode !== 'player' ? 'on' : ''}" onclick="socket.emit('${ev}',{mode:'dedicated'})">🎙️ Dedicated host</button>
  <button class="tab ${mode === 'player' ? 'on' : ''}" onclick="socket.emit('${ev}',{mode:'player'})">🎮 Player host / no official host</button></div>
  <p class="muted" style="font-size:13px;margin:0">${mode === 'player' ? txt.player || 'Everyone plays. Clues stay hidden and are read aloud by this screen; buzzers open after the reading. The player who buzzes checks the answer privately on their phone and marks themselves right or wrong.'   : txt.dedicated || 'A non-player runs the game and sees clues and answers on this screen.'}</p></div>`; }
