// Culper — rules engine.
// Pure: no DOM, no network, no clock. The room is an append-only event log;
// `reduce` folds one event into the state. Every client folds the same log,
// so every client sees the same board. Invalid events are ignored (counted
// in state.rejected) rather than thrown, because a stale client may append
// something that lost a race.
//
// The state object is mutated in place and returned. Determinism is what
// matters for replay, not immutability.

export const TEAMS = ['red', 'blue'];
export const BOARD = 25;
export const COUNTS = { first: 9, second: 8, bystander: 7, mole: 1 };

export const other = (t) => (t === 'red' ? 'blue' : 'red');

export function initialState(code) {
  return {
    code,
    pack: null,
    settings: { timerSeconds: null },
    players: {},   // id -> { id, name, team, role, joined, handled }
    order: [],     // player ids in join order
    usedWords: [], // dealt so far in this room: draw without replacement
    games: [],     // finished games, whole objects
    game: null,    // the live game
    applied: 0,
    rejected: 0,
    lastRejection: null,
  };
}

// ---------------------------------------------------------------- helpers

function remaining(game, team) {
  let n = 0;
  for (let i = 0; i < BOARD; i++) if (game.key[i] === team && !game.revealed[i]) n++;
  return n;
}

export function counts(game) {
  return { red: remaining(game, 'red'), blue: remaining(game, 'blue') };
}

function currentTurn(game) {
  return game.turns[game.turns.length - 1];
}

function teamMembers(s, team) {
  return s.order.map((id) => s.players[id]).filter((p) => p.team === team);
}

function handlerOf(s, team) {
  return teamMembers(s, team).find((p) => p.role === 'handler') || null;
}

export function guessesFor(number) {
  if (number === 'inf' || number === 0) return Infinity;
  return number + 1;
}

export function isBoardWord(game, word) {
  const w = String(word).trim().toLowerCase();
  return game.words.some((x) => x.toLowerCase() === w);
}

// Who should handle next, per team: fewest games handled, ties by join order.
export function proposeHandlers(s) {
  const out = {};
  for (const team of TEAMS) {
    const members = teamMembers(s, team);
    if (!members.length) continue;
    let best = members[0];
    for (const p of members) if ((p.handled || 0) < (best.handled || 0)) best = p;
    out[team] = best.id;
  }
  return out;
}

function setHandlers(s, handlers) {
  for (const team of TEAMS) {
    for (const p of teamMembers(s, team)) p.role = 'agent';
    const h = handlers[team] && s.players[handlers[team]];
    if (h && h.team === team) h.role = 'handler';
  }
}

// Build a game_started payload. `rng` is Math.random-shaped; pass a seeded
// one in tests. `familyWords` are optional and at most `familyMax` are mixed
// in, unmarked.
export function deal(s, packWords, rng = Math.random, familyWords = [], familyMax = 5) {
  const used = new Set(s.usedWords);
  let pool = packWords.filter((w) => !used.has(w));
  let fam = familyWords.filter((w) => !used.has(w) && !packWords.includes(w));
  if (pool.length + fam.length < BOARD) {
    // Pack exhausted for this room: start over, but never repeat the last board.
    const last = new Set(s.game ? s.game.words : []);
    pool = packWords.filter((w) => !last.has(w));
    fam = familyWords.filter((w) => !last.has(w) && !packWords.includes(w));
  }
  const words = [];
  shuffle(fam, rng);
  const famCount = Math.min(familyMax, fam.length, Math.max(0, BOARD - pool.length) || familyMax);
  words.push(...fam.slice(0, famCount));
  shuffle(pool, rng);
  words.push(...pool.slice(0, BOARD - words.length));
  shuffle(words, rng);

  // Alternate who goes first; first game is random.
  const lastGame = s.games[s.games.length - 1];
  const first = lastGame ? other(lastGame.first) : rng() < 0.5 ? 'red' : 'blue';
  const key = [];
  for (let i = 0; i < COUNTS.first; i++) key.push(first);
  for (let i = 0; i < COUNTS.second; i++) key.push(other(first));
  for (let i = 0; i < COUNTS.bystander; i++) key.push('bystander');
  for (let i = 0; i < COUNTS.mole; i++) key.push('mole');
  shuffle(key, rng);

  // Handlers: whoever holds the role now; fill gaps by rotation.
  const handlers = {};
  const proposed = proposeHandlers(s);
  for (const team of TEAMS) {
    const h = handlerOf(s, team);
    handlers[team] = h ? h.id : proposed[team];
  }
  return { words, key, first, handlers };
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- reducer

export function reduce(s, e) {
  const r = apply(s, e);
  if (r === true) s.applied++;
  else {
    s.rejected++;
    s.lastRejection = { id: e.id, type: e.type, reason: r, by: e.by };
  }
  return s;
}

function apply(s, e) {
  const me = e.by ? s.players[e.by] : null;
  const g = s.game;
  const live = g && g.phase !== 'over';

  switch (e.type) {
    case 'room_created': {
      s.pack = e.pack || s.pack;
      if (e.settings) Object.assign(s.settings, e.settings);
      return true;
    }
    case 'settings_updated': {
      if (!('timerSeconds' in e)) return 'nothing to set';
      s.settings.timerSeconds = e.timerSeconds == null ? null : Number(e.timerSeconds);
      return true;
    }
    case 'player_joined': {
      if (!e.playerId || !e.name) return 'need playerId and name';
      if (s.players[e.playerId]) {
        s.players[e.playerId].name = String(e.name).slice(0, 24);
        return true; // rejoin
      }
      s.players[e.playerId] = {
        id: e.playerId,
        name: String(e.name).slice(0, 24),
        team: null,
        role: 'agent',
        joined: e.t || 0,
        handled: 0,
      };
      s.order.push(e.playerId);
      return true;
    }
    case 'player_updated': {
      if (!me) return 'unknown player';
      if ('name' in e) me.name = String(e.name).slice(0, 24);
      if ('team' in e) {
        if (!TEAMS.includes(e.team)) return 'bad team';
        if (live && me.team && me.team !== e.team) return 'cannot switch teams mid-game';
        if (me.team !== e.team) {
          me.team = e.team;
          me.role = 'agent';
        }
      }
      if ('role' in e) {
        if (!['handler', 'agent'].includes(e.role)) return 'bad role';
        if (live) return 'roles are locked during a game';
        if (!me.team) return 'pick a team first';
        if (e.role === 'handler') {
          for (const p of teamMembers(s, me.team)) if (p.role === 'handler') p.role = 'agent';
        }
        me.role = e.role;
      }
      return true;
    }
    case 'player_left': {
      if (!me) return 'unknown player';
      if (live) return 'cannot leave mid-game';
      delete s.players[e.playerId];
      s.order = s.order.filter((id) => id !== e.playerId);
      return true;
    }
    case 'game_started': {
      if (live) return 'a game is in progress';
      const { words, key, first, handlers } = e;
      if (!Array.isArray(words) || words.length !== BOARD) return 'need 25 words';
      if (!Array.isArray(key) || key.length !== BOARD) return 'need 25 key cells';
      if (!TEAMS.includes(first)) return 'bad first team';
      const tally = { red: 0, blue: 0, bystander: 0, mole: 0 };
      for (const k of key) {
        if (!(k in tally)) return 'bad key cell';
        tally[k]++;
      }
      if (tally[first] !== COUNTS.first || tally[other(first)] !== COUNTS.second) return 'bad team counts';
      if (tally.bystander !== COUNTS.bystander || tally.mole !== COUNTS.mole) return 'bad neutral counts';
      if (!handlers || !TEAMS.every((t) => s.players[handlers[t]] && s.players[handlers[t]].team === t)) {
        return 'each team needs a handler';
      }
      if (!TEAMS.every((t) => teamMembers(s, t).some((p) => p.id !== handlers[t]))) {
        return 'each team needs at least one agent';
      }
      setHandlers(s, handlers);
      for (const t of TEAMS) s.players[handlers[t]].handled = (s.players[handlers[t]].handled || 0) + 1;
      s.usedWords.push(...words);
      s.game = {
        no: s.games.length + 1,
        words: words.slice(),
        key: key.slice(),
        revealed: new Array(BOARD).fill(null),
        first,
        turn: first,
        phase: 'clue',
        clue: null,
        winner: null,
        reason: null,
        handlers: { ...handlers },
        turns: [],
        startedAt: e.t || 0,
        endedAt: null,
        turnStartedAt: e.t || 0,
      };
      return true;
    }
    case 'clue_given': {
      if (!live) return 'no live game';
      if (g.phase !== 'clue') return 'not waiting for a clue';
      if (!me || me.team !== g.turn || me.role !== 'handler') return 'only the handler on turn gives clues';
      const word = String(e.word || '').trim();
      if (!word) return 'empty clue';
      if (word.length > 40) return 'clue too long';
      if (isBoardWord(g, word)) return 'clue is on the board';
      const number = e.number === 'inf' ? 'inf' : Number(e.number);
      if (number !== 'inf' && !(Number.isInteger(number) && number >= 0 && number <= 9)) return 'bad number';
      g.clue = { word, number, guessesLeft: guessesFor(number), taps: 0 };
      g.phase = 'guess';
      g.turns.push({ team: g.turn, handler: me.id, clue: word, number, taps: [], end: null, at: e.t || 0 });
      return true;
    }
    case 'tile_tapped': {
      if (!live) return 'no live game';
      if (g.phase !== 'guess') return 'not guessing';
      if (!me || me.team !== g.turn) return 'not your turn';
      if (me.role !== 'agent') return 'handlers do not tap';
      const i = Number(e.index);
      if (!(Number.isInteger(i) && i >= 0 && i < BOARD)) return 'bad index';
      if (g.revealed[i]) return 'already revealed';
      const cell = g.key[i];
      g.revealed[i] = { team: cell, by: me.id, turn: g.turn, at: e.t || 0 };
      const turn = currentTurn(g);
      turn.taps.push({ index: i, word: g.words[i], result: cell, by: me.id });
      g.clue.taps++;
      if (cell === 'mole') return endGame(s, other(g.turn), 'mole', 'mole', e.t);
      if (cell === g.turn) {
        if (remaining(g, g.turn) === 0) return endGame(s, g.turn, 'all', 'win', e.t);
        g.clue.guessesLeft--;
        if (g.clue.guessesLeft <= 0) return passTurn(g, 'guesses', e.t);
        return true;
      }
      if (cell === other(g.turn)) {
        if (remaining(g, other(g.turn)) === 0) return endGame(s, other(g.turn), 'all', 'opponent', e.t);
        return passTurn(g, 'opponent', e.t);
      }
      return passTurn(g, 'bystander', e.t);
    }
    case 'turn_ended': {
      if (!live) return 'no live game';
      if (g.phase !== 'guess') return 'not guessing';
      if (!me || me.team !== g.turn) return 'not your turn';
      if (g.clue.taps < 1) return 'make at least one guess first';
      return passTurn(g, 'pass', e.t);
    }
    case 'turn_timed_out': {
      // Any player may call time on the turn in progress. The event carries the
      // turn's start stamp so a late duplicate for an old turn is rejected.
      if (!live) return 'no live game';
      if (!me) return 'unknown player';
      if (!s.settings.timerSeconds) return 'no timer';
      if (e.turnStartedAt !== g.turnStartedAt) return 'stale timeout';
      if (g.phase === 'clue') {
        g.turns.push({ team: g.turn, handler: g.handlers[g.turn], clue: null, number: null, taps: [], end: null, at: e.t || 0 });
      }
      return passTurn(g, 'time', e.t);
    }
    case 'handler_set': {
      // Anyone at the table may name a team's Handler between games.
      if (live) return 'roles are locked during a game';
      if (!me) return 'unknown player';
      const p = s.players[e.playerId];
      if (!p || !TEAMS.includes(e.team) || p.team !== e.team) return 'that player is not on that team';
      for (const q of teamMembers(s, e.team)) q.role = 'agent';
      p.role = 'handler';
      return true;
    }
    case 'game_abandoned': {
      if (!live) return 'no live game';
      return endGame(s, null, 'abandoned', 'abandoned', e.t);
    }
    default:
      return 'unknown event type ' + e.type;
  }
}

function passTurn(g, why, t) {
  currentTurn(g).end = why;
  g.clue = null;
  g.turn = other(g.turn);
  g.phase = 'clue';
  g.turnStartedAt = t || 0;
  return true;
}

function endGame(s, winner, reason, turnEnd, t) {
  const g = s.game;
  const turn = currentTurn(g);
  if (turn && !turn.end) turn.end = turnEnd;
  g.winner = winner;
  g.reason = reason;
  g.phase = 'over';
  g.clue = null;
  g.endedAt = t || 0;
  // Reveal the whole key at the end so the room can see it.
  s.games.push(g);
  // Rotate handlers for the next game: least-handled member of each team.
  const next = proposeHandlers(s);
  setHandlers(s, next);
  return true;
}

// ---------------------------------------------------------------- record

// Stats across every finished game in the room. Pure, cheap, recomputed on demand.
export function stats(s) {
  const games = s.games.filter((g) => g.reason !== 'abandoned');
  const byHandler = {};
  const clues = [];
  const moles = [];
  const wordClued = {};
  const agentTaps = {};
  let timeouts = 0;
  for (const g of games) {
    for (const turn of g.turns) {
      if (turn.clue == null) { timeouts++; continue; } // the clock ran out before a clue
      const correct = turn.taps.filter((x) => x.result === turn.team).length;
      const h = (byHandler[turn.handler] ||= { clues: 0, correct: 0, tapsMeant: 0, moles: 0 });
      h.clues++;
      h.correct += correct;
      h.tapsMeant += turn.number === 'inf' ? correct : turn.number;
      if (turn.end === 'mole') h.moles++;
      clues.push({ game: g.no, team: turn.team, handler: turn.handler, clue: turn.clue, number: turn.number, correct, end: turn.end });
      for (const tap of turn.taps) {
        const a = (agentTaps[tap.by] ||= { taps: 0, correct: 0, moles: 0 });
        a.taps++;
        if (tap.result === turn.team) a.correct++;
        if (tap.result === 'mole') {
          a.moles++;
          moles.push({ game: g.no, by: tap.by, word: tap.word, clue: turn.clue });
        }
        if (tap.result === turn.team) wordClued[tap.word] = (wordClued[tap.word] || 0) + 1;
      }
    }
  }
  const bestClue = clues.slice().sort((a, b) => b.correct - a.correct || (a.number === 'inf' ? 99 : a.number) - (b.number === 'inf' ? 99 : b.number))[0] || null;
  const longestTurn = clues.reduce((m, c) => Math.max(m, c.correct), 0);
  const mostClued = Object.entries(wordClued).sort((a, b) => b[1] - a[1])[0] || null;
  // Efficiency: a Handler's correct taps over the taps they promised; an Agent's correct taps over taps made.
  for (const h of Object.values(byHandler)) h.efficiency = h.tapsMeant ? h.correct / h.tapsMeant : 0;
  for (const a of Object.values(agentTaps)) a.accuracy = a.taps ? a.correct / a.taps : 0;
  const bestHandler = Object.entries(byHandler).filter(([, h]) => h.clues >= 2).sort((a, b) => b[1].efficiency - a[1].efficiency || b[1].correct - a[1].correct)[0] || null;
  const bestAgent = Object.entries(agentTaps).filter(([, a]) => a.taps >= 3).sort((a, b) => b[1].accuracy - a[1].accuracy || b[1].correct - a[1].correct)[0] || null;
  return { games: games.length, byHandler, agentTaps, clues, moles, bestClue, longestTurn, mostClued, timeouts, bestHandler, bestAgent };
}

// Fold a whole log. Used on load and by tests.
export function replay(code, events) {
  const s = initialState(code);
  for (const e of events) reduce(s, e);
  return s;
}
