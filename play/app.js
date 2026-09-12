// Culper — the client. Renders state, appends events. Nothing here decides a
// rule; engine.js does, and every client runs the same engine over the same
// log, so every screen agrees.
import config from './config.js';
import pack from './packs/americana.js';
import { initialState, reduce, replay, deal, counts, stats, TEAMS, other } from './engine.js';
import { openRoom, openFamilyPack, identity } from './sync.js';

const app = document.getElementById('app');
const me = identity();
const L = pack.labels;

let room = null;
let state = null;
let log = [];   // [{ key, e }] sorted by key: the room's log in its own order, not arrival order
let fam = null;
let famWords = [];
let unsub = null;
const ui = { screen: 'home', error: '', keyView: true, tab: 'log', joinCode: '', busy: false };

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const P = (id) => (state && state.players[id]) || { name: '?', team: null, role: 'agent' };
const mine = () => (state && state.players[me.id]) || null;
const team = (t) => (state ? state.order.map((id) => state.players[id]).filter((p) => p.team === t) : []);
const handlerOf = (t) => team(t).find((p) => p.role === 'handler');
const num = (n) => (n === 'inf' ? '∞' : String(n));
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function roomCode() {
  const plain = pack.words.filter((w) => /^[A-Za-z]{3,9}$/.test(w));
  const pick = () => plain[Math.floor(Math.random() * plain.length)].toUpperCase();
  let a = pick(); let b = pick();
  while (b === a) b = pick();
  return a + '-' + b;
}

function setUrl(code) {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
  history.replaceState(null, '', u);
}

async function send(e) {
  if (!room) return;
  await room.append({ by: me.id, ...e });
}

// -------------------------------------------------------------------- flow
async function createRoom() {
  const code = roomCode();
  room = await openRoom(code, config);
  await room.append({ type: 'room_created', by: me.id, pack: pack.id, settings: { timerSeconds: config.timerDefault } });
  await join(code);
}

async function join(code) {
  code = String(code || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!/^[A-Z]+-[A-Z]+$/.test(code)) { ui.error = 'A room code looks like MUSTANG-DELTA.'; return render(); }
  if (!me.name) { ui.joinCode = code; ui.error = 'Pick a name first.'; return render(); }
  ui.busy = true; render();
  try {
    if (!room || room.code !== code) {
      if (unsub) unsub();
      if (room) room.close();
      room = await openRoom(code, config);
    }
    if (!(await room.exists())) {
      ui.error = 'No room called ' + code + '. Check the code, or create one.';
      room.close(); room = null; ui.busy = false;
      return render();
    }
    state = initialState(code);
    log = [];
    ui.screen = 'lobby';
    unsub = room.subscribe(onEvent);
    await room.append({ type: 'player_joined', by: me.id, playerId: me.id, name: me.name });
    if (!fam) {
      fam = await openFamilyPack(config);
      fam.subscribe((w) => { if (w && w.word && !famWords.some((x) => x.id === w.id)) { famWords.push(w); render(); } });
    }
    setUrl(code);
    ui.error = '';
  } catch (err) {
    ui.error = 'Could not open the room: ' + (err && err.message ? err.message : err);
  }
  ui.busy = false;
  render();
}

// Fold an event in the log's own order. A client sees its own write before
// older history finishes loading, and two clients can see near-simultaneous
// events in different orders, so an event that lands out of sequence triggers
// a replay of the whole log. A few hundred events fold in under a millisecond,
// and every client ends up with the same state from the same set of events.
function onEvent(e, key) {
  if (log.some((x) => x.e.id === e.id)) return;
  let i = log.length;
  while (i > 0 && log[i - 1].key > key) i--;
  log.splice(i, 0, { key, e });
  if (i === log.length - 1) reduce(state, e);
  else state = replay(state.code, log.map((x) => x.e));
  if (e.by === me.id) {
    const rej = state.lastRejection;
    ui.error = rej && rej.id === e.id ? rej.reason : '';
  }
  if (e.type === 'game_started' && state.game && state.game.startedAt === e.t) ui.screen = 'game';
  if (e.type === 'game_started') { ui.keyView = true; ui.tab = 'log'; }
  render();
}

async function leave() {
  if (room && state && !(state.game && state.game.phase !== 'over')) {
    await send({ type: 'player_left', playerId: me.id });
  }
  if (unsub) unsub();
  if (room) room.close();
  room = null; state = null; unsub = null; log = [];
  ui.screen = 'home'; ui.error = '';
  setUrl(null);
  render();
}

function dealGame() {
  const payload = deal(state, pack.words, Math.random, famWords.map((f) => f.word), config.familyMax);
  for (const t of TEAMS) {
    if (!payload.handlers[t]) { ui.error = cap(t) + ' needs a ' + L.handler + '.'; return render(); }
    if (team(t).length < 2) { ui.error = cap(t) + ' needs at least two people.'; return render(); }
  }
  ui.error = '';
  send({ type: 'game_started', ...payload });
}

// ---------------------------------------------------------------- actions
const actions = {
  'set-name': (el) => { const v = document.getElementById('name').value.trim().slice(0, 24); if (!v) return; me.save({ name: v }); ui.error = ''; if (state) send({ type: 'player_updated', name: v }); render(); },
  'create': async () => { const v = document.getElementById('name').value.trim().slice(0, 24); if (!v) { ui.error = 'Pick a name first.'; return render(); } me.save({ name: v }); ui.busy = true; render(); await createRoom(); },
  'join': async () => { const v = document.getElementById('name').value.trim().slice(0, 24); if (v) me.save({ name: v }); await join(document.getElementById('code').value); },
  'leave': leave,
  'team': (el) => send({ type: 'player_updated', team: el.dataset.team }),
  'handler': () => send({ type: 'player_updated', role: 'handler' }),
  'agent': () => send({ type: 'player_updated', role: 'agent' }),
  'timer': (el) => send({ type: 'settings_updated', timerSeconds: el.value ? Number(el.value) : null }),
  'deal': dealGame,
  'lobby': () => { ui.screen = 'lobby'; render(); },
  'game': () => { ui.screen = 'game'; render(); },
  'copy': async (el) => { try { await navigator.clipboard.writeText(location.origin + location.pathname + '?room=' + state.code); el.textContent = 'Copied'; setTimeout(render, 1200); } catch { el.textContent = location.href; } },
  'clue': () => {
    const word = document.getElementById('clue').value.trim();
    const n = document.getElementById('clue-n').value;
    if (!word) return;
    ui.error = '';
    send({ type: 'clue_given', word, number: n === 'inf' ? 'inf' : Number(n) });
  },
  'tap': (el) => send({ type: 'tile_tapped', index: Number(el.dataset.i) }),
  'end-turn': () => send({ type: 'turn_ended' }),
  'abandon': () => { if (confirm('Abandon this game? It will not count.')) send({ type: 'game_abandoned' }); },
  'keyview': () => { ui.keyView = !ui.keyView; render(); },
  'tab': (el) => { ui.tab = el.dataset.tab; render(); },
  'fam-add': async () => { const inp = document.getElementById('fam'); const w = inp.value.trim().slice(0, 24); if (!w) return; await fam.add(w, me.name); inp.value = ''; render(); },
};

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el);
});
app.addEventListener('change', (ev) => {
  const el = ev.target.closest('select[data-action]');
  if (el) actions[el.dataset.action](el);
});
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const t = ev.target;
  if (t.id === 'clue') actions.clue();
  if (t.id === 'code') actions.join();
  if (t.id === 'name' && !state) { const code = document.getElementById('code'); if (code && code.value) actions.join(); else actions.create(); }
  if (t.id === 'name' && state) actions['set-name']();
  if (t.id === 'fam') actions['fam-add']();
});

// ------------------------------------------------------------------ render
function render() {
  let html = '';
  if (!state || ui.screen === 'home') html = renderHome();
  else if (ui.screen === 'lobby' || !state.game) html = renderLobby();
  else html = renderGame();
  app.innerHTML = html + `<footer>Culper · ${esc(pack.name)} pack · ${config.backend === 'local' ? 'this browser only' : 'shared'} · v${config.version}</footer>`;
}

function renderHome() {
  const code = ui.joinCode || new URL(location.href).searchParams.get('room') || '';
  return `
  <div class="hero"><h1>Culper</h1><div class="sub">Two teams. One board. Say one word.</div></div>
  <div class="card stack">
    <label>Your name<input type="text" id="name" maxlength="24" placeholder="What the family calls you" value="${esc(me.name)}" autocomplete="nickname"></label>
    <label>Room code<input type="text" id="code" class="code-input" placeholder="MUSTANG-DELTA" value="${esc(code)}" autocapitalize="characters" autocomplete="off"></label>
    ${ui.error ? `<div class="err">${esc(ui.error)}</div>` : ''}
    <div class="row">
      <button class="primary" data-action="join" ${ui.busy ? 'disabled' : ''}>Join room</button>
      <button data-action="create" ${ui.busy ? 'disabled' : ''}>Create a new room</button>
    </div>
    <small>Open this page beside your video call. One person creates a room and reads the code aloud, or sends the link.</small>
  </div>
  ${renderHelp()}`;
}

function renderPlayers(t, inLobby) {
  const my = mine();
  const rows = team(t).map((p) => `<li class="${p.id === me.id ? 'me' : ''}"><span>${esc(p.name)}${p.role === 'handler' ? ` <span class="badge handler">${esc(L.handler)}</span>` : ''}</span>
      ${inLobby && p.id === me.id && !(state.game && state.game.phase !== 'over') ? (p.role === 'handler' ? `<button class="small ghost" data-action="agent">Be an ${esc(L.agent)}</button>` : `<button class="small" data-action="handler">Be the ${esc(L.handler)}</button>`) : ''}</li>`).join('');
  return `<div class="team ${t}"><h3>${cap(t)} <span class="muted">· ${team(t).length}</span></h3>
    ${inLobby && (!my || my.team !== t) ? `<button class="small ${t}" data-action="team" data-team="${t}">Join ${cap(t)}</button>` : ''}
    <ul>${rows || '<li class="unassigned">nobody yet</li>'}</ul></div>`;
}

function renderLobby() {
  const g = state.game;
  const my = mine();
  const unassigned = state.order.map((id) => state.players[id]).filter((p) => !p.team);
  const ready = TEAMS.every((t) => handlerOf(t) && team(t).length >= 2);
  const live = g && g.phase !== 'over';
  return `
  <div class="row between"><h1>Culper</h1><div class="row"><span class="badge">${esc(state.code)}</span><button class="small" data-action="copy">Copy link</button><button class="small ghost" data-action="leave">Leave</button></div></div>
  <div class="card stack">
    <div class="row"><input type="text" id="name" maxlength="24" value="${esc(me.name)}" style="max-width:260px"><button class="small" data-action="set-name">Rename</button></div>
    <div class="teams">${renderPlayers('red', true)}${renderPlayers('blue', true)}</div>
    ${unassigned.length ? `<div class="unassigned">Not on a team yet: ${unassigned.map((p) => esc(p.name)).join(', ')}</div>` : ''}
    <div class="row between">
      <label class="row">Turn timer <select data-action="timer">${[['', 'none'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00']].map(([v, l]) => `<option value="${v}" ${String(state.settings.timerSeconds || '') === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${live ? `<button class="primary" data-action="game">Back to the board</button>` : `<button class="primary" data-action="deal" ${ready ? '' : 'disabled'}>${g ? 'Deal the next game' : 'Deal'}</button>`}
    </div>
    ${!ready && !live ? `<small>Each team needs a ${esc(L.handler)} and at least one ${esc(L.agent)}. ${g ? `${esc(L.handler)}s rotate on their own; change them here if you like.` : ''}</small>` : ''}
    ${ui.error ? `<div class="err">${esc(ui.error)}</div>` : ''}
  </div>
  ${renderTabs(['family', 'record', 'help'])}`;
}

function renderGame() {
  const g = state.game;
  const my = mine();
  const c = counts(g);
  const live = g.phase !== 'over';
  const myTurn = my && my.team === g.turn && live;
  const isHandler = my && my.role === 'handler';
  const showKey = (isHandler && ui.keyView) || !live;
  const canTap = myTurn && my.role === 'agent' && g.phase === 'guess';
  const h = P(g.handlers[g.turn]);
  let status = '';
  if (!live) status = '';
  else if (g.phase === 'clue') status = isHandler && myTurn ? `<b>Your clue.</b> One word and a number.` : `Waiting for <b>${esc(h.name)}</b>, the ${cap(g.turn)} ${esc(L.handler)}.`;
  else status = myTurn ? (my.role === 'agent' ? `<b>Tap a tile.</b> ${g.clue.guessesLeft === Infinity ? 'As many as you dare.' : g.clue.guessesLeft + ' guess' + (g.clue.guessesLeft === 1 ? '' : 'es') + ' left.'}` : `Your ${esc(L.agent)}s are guessing. Keep a straight face.`) : `${cap(g.turn)} is guessing.`;
  const timer = state.settings.timerSeconds && live ? renderTimer(g) : '';

  const tiles = g.words.map((w, i) => {
    const r = g.revealed[i];
    const cls = ['tile'];
    if (r) cls.push('revealed', r.team);
    else if (showKey) cls.push('key-' + g.key[i]);
    if (!r && canTap) cls.push('tappable');
    const run = Math.max(...w.split(/[\s-]+/).map((s) => s.length));
    if (run >= 10) cls.push('xlong'); else if (run >= 7) cls.push('long');
    return `<div class="${cls.join(' ')}" ${!r && canTap ? `data-action="tap" data-i="${i}" role="button" tabindex="0"` : ''}><span class="word">${esc(w)}</span></div>`;
  }).join('');

  let over = '';
  if (!live) {
    const why = g.reason === 'mole' ? `${cap(other(g.winner))} tapped ${esc(L.mole)}.` : g.reason === 'all' ? `${cap(g.winner)} found every word.` : 'Game abandoned.';
    over = `<div class="over ${g.winner || 'none'}"><h2>${g.winner ? cap(g.winner) + ' wins' : 'No result'}</h2><div>${why}</div></div>`;
  }

  let controls = '';
  if (live && isHandler && myTurn && g.phase === 'clue') {
    controls = `<div class="clueform"><input type="text" id="clue" maxlength="40" placeholder="One word" autocomplete="off" autocapitalize="characters"><select id="clue-n">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'inf'].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${num(n)}</option>`).join('')}</select><button class="primary" data-action="clue">Send</button></div>`;
  } else if (live && myTurn && g.phase === 'guess' && g.clue.taps > 0) {
    controls = `<div class="row" style="justify-content:center"><button data-action="end-turn">End turn</button></div>`;
  }
  const bottom = !live
    ? `<div class="row" style="justify-content:center"><button class="primary" data-action="deal">Deal the next game</button><button data-action="lobby">Lobby</button></div>`
    : `<div class="row between"><button class="small ghost" data-action="lobby">Players</button>${isHandler ? `<button class="small" data-action="keyview">${ui.keyView ? 'Hide key' : 'Show key'}</button>` : ''}<button class="small ghost" data-action="abandon">Abandon</button></div>`;

  return `
  <div class="topbar"><div class="score red">${c.red}</div><div><div class="turn ${live ? g.turn : ''}">${live ? cap(g.turn) + (g.phase === 'clue' ? ' · clue' : ' · guess') : 'Game ' + g.no + ' over'}</div>${timer}</div><div class="score blue">${c.blue}</div></div>
  ${over}
  ${showKey && live ? `<div class="keybanner">${esc(L.handler)} view · hide before you share your screen</div>` : ''}
  <div class="cluebar ${g.clue ? '' : 'waiting'}">${g.clue ? `<span class="clue">${esc(g.clue.word)}</span><span class="num">${num(g.clue.number)}</span>` : (live ? 'waiting for a clue' : 'the key is open')}</div>
  <div class="board">${tiles}</div>
  <div class="controls">${status ? `<div class="status">${status}</div>` : ''}${controls}${ui.error ? `<div class="err">${esc(ui.error)}</div>` : ''}${bottom}</div>
  <div class="row" style="margin-top:8px;font-size:.85rem"><span class="badge red">Red</span> ${team('red').map((p) => esc(p.name) + (p.role === 'handler' ? '*' : '')).join(', ') || '—'} &nbsp; <span class="badge blue">Blue</span> ${team('blue').map((p) => esc(p.name) + (p.role === 'handler' ? '*' : '')).join(', ') || '—'}</div>
  ${renderTabs(['log', 'record', 'family', 'help'])}`;
}

function renderTimer(g) {
  const end = g.turnStartedAt + state.settings.timerSeconds * 1000;
  const left = end - Date.now();
  return `<div class="timer ${left < 15000 ? 'low' : ''}" id="timer">${left <= 0 ? 'time' : fmtTime(left)}</div>`;
}
setInterval(() => { const el = document.getElementById('timer'); if (el && state && state.game && state.game.phase !== 'over') { const end = state.game.turnStartedAt + state.settings.timerSeconds * 1000; const left = end - Date.now(); el.textContent = left <= 0 ? 'time' : fmtTime(left); el.classList.toggle('low', left < 15000); } }, 1000);

function renderTabs(tabs) {
  if (!tabs.includes(ui.tab)) ui.tab = tabs[0];
  const names = { log: 'This game', record: 'Record', family: 'Family pack', help: 'How to play' };
  const body = { log: renderLog, record: renderRecord, family: renderFamily, help: renderHelp }[ui.tab]();
  return `<div class="tabs">${tabs.map((t) => `<button class="${ui.tab === t ? 'on' : ''}" data-action="tab" data-tab="${t}">${names[t]}</button>`).join('')}</div>${body}`;
}

function turnLine(turn) {
  const correct = turn.taps.filter((x) => x.result === turn.team).length;
  return `<li><span class="chip ${turn.team}">${turn.team}</span> <span class="who">${esc(P(turn.handler).name)}</span>: <b>${esc(turn.clue)}</b> ${num(turn.number)} → ${correct} right${turn.end ? ` · ${esc(turn.end === 'guesses' ? 'used them all' : turn.end)}` : ''}
    <div class="taps">${turn.taps.map((x) => `<span class="chip ${x.result}">${esc(x.word)}</span>`).join('')}</div></li>`;
}

function renderLog() {
  const g = state.game;
  if (!g) return '<p class="muted">No game yet.</p>';
  return `<ul class="log">${g.turns.slice().reverse().map(turnLine).join('') || '<li class="muted">No clues yet.</li>'}</ul>`;
}

function renderRecord() {
  const st = stats(state);
  if (!st.games) return '<p class="muted">The record starts after the first finished game. Every clue, every tap, every ' + esc(L.mole) + ' goes in it.</p>';
  const name = (id) => esc(P(id).name);
  const handlers = Object.entries(st.byHandler).sort((a, b) => b[1].correct - a[1].correct).map(([id, h]) => `<li>${name(id)}: ${h.clues} clue${h.clues === 1 ? '' : 's'}, ${h.correct} of ${h.tapsMeant} meant, ${h.moles} ${esc(L.mole)}${h.moles === 1 ? '' : 's'}</li>`).join('');
  const agents = Object.entries(st.agentTaps).sort((a, b) => b[1].correct / b[1].taps - a[1].correct / a[1].taps).map(([id, a]) => `<li>${name(id)}: ${a.correct}/${a.taps} taps right${a.moles ? `, tapped ${esc(L.mole)} ${a.moles}×` : ''}</li>`).join('');
  const games = state.games.slice().reverse().map((g) => `<li>Game ${g.no}: ${g.winner ? `<span class="chip ${g.winner}">${g.winner}</span> ${g.reason === 'mole' ? esc(L.mole) : 'all words'}` : 'abandoned'} · ${g.turns.length} turns · ${esc(L.handler)}s ${name(g.handlers.red)} / ${name(g.handlers.blue)}</li>`).join('');
  return `<div class="stack">
    <div class="stats">
      <div class="stat"><div class="k">Games</div><div class="v">${st.games}</div></div>
      <div class="stat"><div class="k">Best clue</div><div class="v">${st.bestClue ? `${esc(st.bestClue.clue)} ${num(st.bestClue.number)} → ${st.bestClue.correct}` : '—'}</div><small>${st.bestClue ? name(st.bestClue.handler) : ''}</small></div>
      <div class="stat"><div class="k">Longest turn</div><div class="v">${st.longestTurn}</div></div>
      <div class="stat"><div class="k">Most found word</div><div class="v">${st.mostClued ? esc(st.mostClued[0]) : '—'}</div></div>
    </div>
    <div class="card"><h2>${esc(L.handler)}s</h2><ul>${handlers}</ul></div>
    <div class="card"><h2>${esc(L.agent)}s</h2><ul>${agents}</ul></div>
    ${st.moles.length ? `<div class="card"><h2>${esc(L.mole)} club</h2><ul>${st.moles.map((m) => `<li>Game ${m.game}: ${name(m.by)} tapped <b>${esc(m.word)}</b> on "${esc(m.clue)}"</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2>Games</h2><ul class="log">${games}</ul></div>
  </div>`;
}

function renderFamily() {
  return `<div class="card stack">
    <p>Words only this family would clue. Up to ${config.familyMax} land on each board, unmarked.</p>
    <div class="row"><input type="text" id="fam" maxlength="24" placeholder="Add a word" style="max-width:260px" ${fam ? '' : 'disabled'}><button class="small" data-action="fam-add" ${fam ? '' : 'disabled'}>Add</button></div>
    <div class="words">${famWords.map((w) => `<span class="w" title="${esc(w.by || '')}">${esc(w.word)}</span>`).join('') || '<small class="muted">Nothing yet.</small>'}</div>
  </div>`;
}

function renderHelp() {
  return `<div class="card help">
    <h2>How to play</h2>
    <ol>
      <li>Two teams, Red and Blue. Each names a <b>${esc(L.handler)}</b>. Everyone else is an <b>${esc(L.agent)}</b>.</li>
      <li>25 words. The ${esc(L.handler)}s alone see which are Red, which are Blue, which are ${esc(L.bystander)}s, and which one is <b>${esc(L.mole)}</b>.</li>
      <li>On your turn, your ${esc(L.handler)} says <b>one word and a number</b>. The word may not be on the board. The number is how many tiles it points at.</li>
      <li>${esc(L.agent)}s tap tiles one at a time. Your color: keep going. A ${esc(L.bystander)} or the other team's color: turn over. ${esc(L.mole)}: you lose on the spot.</li>
      <li>You may tap up to the number <b>plus one</b>, and may stop after one.</li>
      <li>First team to find all its words wins. The team that goes first has nine, the other eight.</li>
      <li>${esc(L.handler)}s rotate every game. The Record keeps every clue.</li>
    </ol>
    <small>Culper is named for Washington's spy ring on Long Island, which ran on code names and a numbered code book.</small>
  </div>`;
}

// -------------------------------------------------------------------- boot
(async function boot() {
  const code = new URL(location.href).searchParams.get('room');
  render();
  if (code && me.name) await join(code);
  else if (code) { ui.joinCode = code; render(); }
})();
