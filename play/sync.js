// Culper — transports for the event log.
//
//   const room = await openRoom(code, config);
//   room.append(event)      -> Promise<event>; the event gets an id and a timestamp
//   room.subscribe(fn)      -> unsubscribe; fn(event, key) for every event, past then live.
//                              `key` is the log's own ordering (database push key, or
//                              the id locally). Arrival order is NOT guaranteed to be
//                              key order: a client sees its own write before older
//                              history has finished loading. Callers sort by key.
//   room.close()
//
//   const fam = await openFamilyPack(config);
//   fam.add(word, by)       -> Promise
//   fam.subscribe(fn)       -> unsubscribe; fn(entry) for every entry, past then live
//
// Two backends. 'local' is localStorage plus BroadcastChannel, so every tab
// of one browser shares the room. 'firebase' is the Realtime Database, no
// server code, every device shares the room. The app never knows which.

export function newId() {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return t + r;
}

// ------------------------------------------------------------------ local

function localKey(code) { return 'culper:room:' + code; }

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

function writeLocal(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

function localChannel(name, onMessage) {
  const ch = new BroadcastChannel(name);
  ch.onmessage = (m) => onMessage(m.data);
  return ch;
}

function openLocalLog(key) {
  const subs = new Set();
  const seen = new Set();
  const deliver = (e) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    for (const fn of subs) fn(e, e.id);
  };
  const ch = localChannel(key, (e) => deliver(e));
  // Fallback for browsers where BroadcastChannel is flaky: the storage event.
  const onStorage = (ev) => {
    if (ev.key !== key) return;
    for (const e of readLocal(key)) deliver(e);
  };
  window.addEventListener('storage', onStorage);
  return {
    exists: () => localStorage.getItem(key) != null,
    async append(e) {
      const arr = readLocal(key);
      arr.push(e);
      writeLocal(key, arr);
      deliver(e);
      ch.postMessage(e);
    },
    subscribe(fn) {
      subs.add(fn);
      for (const e of readLocal(key)) {
        if (!seen.has(e.id)) { seen.add(e.id); }
        fn(e, e.id);
      }
      return () => subs.delete(fn);
    },
    close() {
      ch.close();
      window.removeEventListener('storage', onStorage);
      subs.clear();
    },
  };
}

// --------------------------------------------------------------- firebase

let fb = null;
async function firebase(config) {
  if (fb) return fb;
  const v = '10.14.1';
  const [app, db] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${v}/firebase-database.js`),
  ]);
  const a = app.initializeApp(config.firebase);
  fb = { db: db.getDatabase(a), ...db };
  return fb;
}

async function openFirebaseLog(path, config) {
  const f = await firebase(config);
  const listRef = f.ref(f.db, path);
  const subs = new Set();
  const seen = new Set();
  let live = null;
  return {
    async exists() {
      const snap = await f.get(f.query(listRef, f.limitToFirst(1)));
      return snap.exists();
    },
    async append(e) {
      await f.push(listRef, e);
    },
    subscribe(fn) {
      subs.add(fn);
      if (!live) {
        // child_added fires for every existing child in key order, then live.
        live = f.onChildAdded(listRef, (snap) => {
          const e = snap.val();
          if (!e || seen.has(e.id)) return;
          seen.add(e.id);
          for (const s of subs) s(e, snap.key);
        });
      }
      return () => subs.delete(fn);
    },
    close() {
      if (live) live();
      live = null;
      subs.clear();
    },
  };
}

// ------------------------------------------------------------------ public

function stamp(e) {
  return { id: newId(), t: Date.now(), ...e };
}

export async function openRoom(code, config) {
  const log = config.backend === 'firebase'
    ? await openFirebaseLog('rooms/' + code + '/events', config)
    : openLocalLog(localKey(code));
  return {
    code,
    exists: () => log.exists(),
    async append(e) { const s = stamp(e); await log.append(s); return s; },
    subscribe: (fn) => log.subscribe(fn),
    close: () => log.close(),
  };
}

export async function openFamilyPack(config) {
  const log = config.backend === 'firebase'
    ? await openFirebaseLog('familyPack/words', config)
    : openLocalLog('culper:family');
  return {
    add: (word, by) => log.append(stamp({ word: String(word).trim(), by })),
    subscribe: (fn) => log.subscribe(fn),
    close: () => log.close(),
  };
}

// Identity: one per browser by default, one per tab when ?new=1 is in the
// URL, which is how one person tests a four-player game on one machine.
export function identity() {
  const url = new URL(location.href);
  const perTab = url.searchParams.get('new') === '1' || sessionStorage.getItem('culper:me');
  const store = perTab ? sessionStorage : localStorage;
  let me = null;
  try { me = JSON.parse(store.getItem('culper:me') || 'null'); } catch { me = null; }
  if (!me || !me.id) {
    me = { id: newId(), name: '' };
    store.setItem('culper:me', JSON.stringify(me));
  }
  return {
    ...me,
    save(patch) {
      Object.assign(me, patch);
      store.setItem('culper:me', JSON.stringify(me));
      Object.assign(this, patch);
    },
  };
}
