/* =========================================================
   store.js ― データ係（保存・読み込み・変更の通知）
   ---------------------------------------------------------
   ・すべてのデータは「コレクション（種類）」ごとに、id 付きの記録として持ちます。
   ・この端末の IndexedDB に保存します。ネットが切れていても動きます。
   ・家族との共有（合言葉）は sync.js が担当。ここは「変わった記録」を覚えておくだけ。
   ・画面のファイルはこの Store を通してしかデータに触りません。
     将来ログイン方式やクラウドDBに変えるときは、ここと sync.js を差し替えます。

   【すべての記録に共通の項目】
     id, createdAt, updatedAt（最後に変えた時刻）, deleted（削除済みなら true）
   削除は「消した」という印を付けて残します（相手の端末にも削除を伝えるため）。

   【コレクション一覧】（中身の詳しい形は README のデータ構造を参照）
     settings   … 家族の名前など（id: 'family' の1件）
     events     … 予定           workdays … 夫の勤務・休み（予定とは別管理）
     tasks      … やること       shopping … 買い物
     wishes     … ほしいもの     dreams   … やりたいこと
     careItems  … ハルのお世話の項目   careLogs … お世話の記録
   ========================================================= */

const Store = (() => {
  const COLLECTIONS = ['settings', 'events', 'workdays', 'tasks', 'shopping', 'wishes', 'dreams', 'careItems', 'careLogs'];
  const DB_NAME = 'uchi-no-koto';

  const data = {}; // { コレクション名: Map(id → 記録) }
  COLLECTIONS.forEach((c) => (data[c] = new Map()));
  const listeners = new Set();
  let outbox = new Set(); // まだ家族の置き場所に送っていない記録（'col/id'）
  let db = null;
  let emitTimer = null;

  // ---------------------------------------------------------
  // IndexedDB
  // ---------------------------------------------------------
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('records', { keyPath: 'key' });
        req.result.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idb(store, mode, fn) {
    if (!db) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }

  function persist(col, rec) {
    return idb('records', 'readwrite', (s) => s.put({ key: col + '/' + rec.id, col, rec })).catch(() => {});
  }

  function saveOutbox() {
    return idb('meta', 'readwrite', (s) => s.put([...outbox], 'outbox')).catch(() => {});
  }

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------
  async function init() {
    try {
      db = await openDb();
      const rows = (await idb('records', 'readonly', (s) => s.getAll())) || [];
      rows.forEach((r) => data[r.col] && data[r.col].set(r.rec.id, r.rec));
      outbox = new Set((await idb('meta', 'readonly', (s) => s.get('outbox'))) || []);
    } catch (e) {
      console.warn('IndexedDB が使えないので、この画面を閉じるまでの保存になります', e);
    }
    seedDefaults();
  }

  // 初回だけ入れておく基本データ。
  // updatedAt を 0 にしておくのは、合言葉で家族とつないだとき、相手の内容を優先させるため。
  // id を固定にしておくのは、2台で同じものが二重にできないようにするため。
  function seedDefaults() {
    if (!data.settings.has('family')) {
      putRaw('settings', {
        id: 'family',
        people: { me: { name: '自分' }, partner: { name: '夫' } },
        createdAt: 0,
        updatedAt: 0,
      });
    }
    // [id, 名前, 毎日の目安(1 or null), 並び順]
    // ハルの水は自動給水機なので「水の交換」「給水機の手入れ」「フィルター交換」に分けている
    const care = [
      ['food', 'ごはん', 1, 0], ['water', '水の交換', null, 1], ['fountain', '給水機の手入れ', null, 1.3],
      ['filter', 'フィルター交換', null, 1.6], ['toilet', 'トイレ掃除', 1, 2], ['play', '遊ぶ', null, 3],
      ['litter', '猫砂全交換', null, 4], ['brush', 'ブラッシング', null, 5], ['nail', '爪切り', null, 6],
      ['vet', '通院', null, 7], ['medicine', '薬', null, 8],
    ];
    care.forEach(([id, title, everyDays, order]) => {
      const key = 'care-' + id;
      if (!data.careItems.has(key)) putRaw('careItems', { id: key, title, everyDays, order, createdAt: 0, updatedAt: 0 });
    });
    // 古い版の「水」（まだ誰も編集していないもの）を「水の交換」に置きかえる
    const water = data.careItems.get('care-water');
    if (water && water.title === '水' && !water.updatedAt) {
      putRaw('careItems', { ...water, title: '水の交換', everyDays: null });
    }
  }

  // 記録を置くだけ（送信リストには入れない）
  function putRaw(col, rec) {
    data[col].set(rec.id, rec);
    persist(col, rec);
  }

  // ---------------------------------------------------------
  // 読む
  // ---------------------------------------------------------
  /** 削除されていない記録の一覧 */
  function all(col) {
    return [...data[col].values()].filter((r) => !r.deleted);
  }
  function get(col, id) {
    const r = data[col].get(id);
    return r && !r.deleted ? r : null;
  }

  // ---------------------------------------------------------
  // 書く
  // ---------------------------------------------------------
  /** 追加・更新。渡した項目だけ書き換える。保存した記録を返す */
  function put(col, rec) {
    const now = Date.now();
    const old = rec.id ? data[col].get(rec.id) : null;
    const next = { ...(old || {}), ...rec };
    next.id = next.id || U.uid();
    next.createdAt = next.createdAt || now;
    next.updatedAt = Math.max(now, (old && old.updatedAt + 1) || 0);
    next.deleted = false;
    data[col].set(next.id, next);
    persist(col, next);
    markDirty(col, next.id);
    emit();
    return next;
  }

  /** 削除（「消した」印を付ける） */
  function remove(col, id) {
    const old = data[col].get(id);
    if (!old) return;
    const next = { ...old, deleted: true, updatedAt: Math.max(Date.now(), old.updatedAt + 1) };
    data[col].set(id, next);
    persist(col, next);
    markDirty(col, id);
    emit();
  }

  function markDirty(col, id) {
    outbox.add(col + '/' + id);
    saveOutbox();
  }

  // ---------------------------------------------------------
  // 家族との同期（sync.js から使う）
  // ---------------------------------------------------------
  /** 送る必要のある記録（コレクション名つき） */
  function pending() {
    return [...outbox]
      .map((key) => {
        const [col, id] = splitKey(key);
        const rec = data[col] && data[col].get(id);
        return rec ? { col, ...rec } : null;
      })
      .filter(Boolean);
  }

  /** 送り終わった記録を送信リストから外す（送った後にまた変わっていたら残す） */
  function ack(sent) {
    sent.forEach((r) => {
      const now = data[r.col] && data[r.col].get(r.id);
      if (now && now.updatedAt === r.updatedAt) outbox.delete(r.col + '/' + r.id);
    });
    saveOutbox();
  }

  /** すべての記録を送信リストに入れる（合言葉を設定したとき用） */
  function markAllDirty() {
    COLLECTIONS.forEach((c) => data[c].forEach((r) => outbox.add(c + '/' + r.id)));
    saveOutbox();
  }

  /** 家族から届いた記録を取り込む（新しいほうを残す） */
  function applyRemote(records) {
    let changed = false;
    records.forEach((r) => {
      if (!r || !data[r.col] || !r.id) return;
      const { col, ...rec } = r;
      const mine = data[col].get(rec.id);
      if (!mine || (rec.updatedAt || 0) > (mine.updatedAt || 0)) {
        data[col].set(rec.id, rec);
        persist(col, rec);
        changed = true;
      }
    });
    if (changed) emit();
    return changed;
  }

  function splitKey(key) {
    const i = key.indexOf('/');
    return [key.slice(0, i), key.slice(i + 1)];
  }

  // 端末に置いておく小さな情報（同期の進み具合など）
  function getMeta(k) {
    return idb('meta', 'readonly', (s) => s.get(k)).catch(() => null);
  }
  function setMeta(k, v) {
    return idb('meta', 'readwrite', (s) => s.put(v, k)).catch(() => {});
  }

  // ---------------------------------------------------------
  // 変更のお知らせ（画面の描き直し用）
  // ---------------------------------------------------------
  function onChange(fn) {
    listeners.add(fn);
  }
  function emit() {
    clearTimeout(emitTimer);
    emitTimer = setTimeout(() => listeners.forEach((fn) => fn()), 0);
  }

  return { COLLECTIONS, init, all, get, put, remove, pending, ack, markAllDirty, applyRemote, getMeta, setMeta, onChange };
})();
