/* =========================================================
   sync.js ― 合言葉で家族と同期する係
   ---------------------------------------------------------
   しくみ：
     1. この端末で変わった記録を /api/sync（Vercel上の小さなプログラム）に送る
     2. 同時に、前回から家族が変えた記録を受け取る
     3. 同じ記録を2人が変えていたら、後から変えたほうを残す
   いつ同期するか：
     ・何かを変えた1秒後
     ・画面を開いている間は20秒ごと
     ・アプリに戻ってきたとき、ネットにつながったとき
   ネットが切れていても、記録は端末に残って、つながった時にまとめて送ります。

   合言葉そのものはサーバーに保存しません（暗号化した値を置き場所の名前に使うだけ）。
   ========================================================= */

const Sync = (() => {
  const ENDPOINT = 'api/sync';
  const INTERVAL = 20000; // 20秒ごと
  const CHUNK = 150; // 1回に送る記録の数
  const OVERLAP = 5000; // 取りこぼし防止に、少し前から受け取り直す（ミリ秒）

  let code = U.pref('code', null);
  let status = code ? 'idle' : 'off'; // off / idle / syncing / ok / offline / not-configured / error
  let lastOkAt = null;
  let running = false;
  let again = false;
  let pushTimer = null;
  let loopTimer = null;
  const listeners = new Set();

  function start() {
    // 送るものがあるときだけ、変更の1秒後に同期（受け取っただけの変更では送らない）
    Store.onChange(() => Store.pending().length && schedule(1000));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
    window.addEventListener('online', () => run());
    window.addEventListener('focus', () => run());
    loop();
  }

  function loop() {
    clearTimeout(loopTimer);
    loopTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') run();
      loop();
    }, INTERVAL);
  }

  function schedule(ms) {
    if (!code) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(run, ms);
  }

  /** 同期を1回行う */
  async function run() {
    if (!code) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    setStatus('syncing');
    try {
      let since = (await Store.getMeta('since:' + code)) || 0;
      let pending = Store.pending();
      // 送るものが多いときは分けて送る（最低1回は受け取りのために通信する）
      do {
        const batch = pending.slice(0, CHUNK);
        pending = pending.slice(CHUNK);
        const res = await post({ code, since, records: batch });
        Store.ack(batch);
        Store.applyRemote(res.records || []);
        since = Math.max(0, res.now - OVERLAP);
      } while (pending.length);
      await Store.setMeta('since:' + code, since);
      lastOkAt = Date.now();
      setStatus('ok');
    } catch (e) {
      setStatus(e.status === 503 ? 'not-configured' : navigator.onLine === false || e.network ? 'offline' : 'error');
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule(300);
      }
    }
  }

  async function post(body) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const err = new Error('network');
      err.network = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error('http ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ---------------------------------------------------------
  // 合言葉の設定
  // ---------------------------------------------------------
  /** 打ちやすい合言葉を作る（例：haru-yoru-tsuki-4821） */
  function generateCode() {
    const words = ['haru', 'yoru', 'tsuki', 'hoshi', 'kumo', 'mori', 'umi', 'sora', 'akari', 'neko', 'koto', 'mado', 'yuki', 'kaze', 'hana', 'kage', 'niwa', 'oto'];
    const pick = () => words[Math.floor(cryptoRandom() * words.length)];
    const num = String(Math.floor(cryptoRandom() * 9000) + 1000);
    return [pick(), pick(), pick(), num].join('-');
  }
  function cryptoRandom() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }

  /** 合言葉のゆれをなくす（前後の空白・大文字小文字・全角スペース） */
  function normalize(c) {
    return (c || '').trim().toLowerCase().replace(/[\s　]+/g, '-');
  }

  /** 合言葉をつなぐ。この端末の記録もまとめて送る */
  function connect(newCode) {
    code = normalize(newCode);
    U.setPref('code', code);
    Store.markAllDirty();
    setStatus('idle');
    return run();
  }

  /** 合言葉を外す（この端末のデータは残る） */
  function disconnect() {
    code = null;
    U.setPref('code', null);
    setStatus('off');
  }

  // ---------------------------------------------------------
  // 状態のお知らせ
  // ---------------------------------------------------------
  function setStatus(s) {
    status = s;
    listeners.forEach((fn) => fn(status));
  }
  function onStatus(fn) {
    listeners.add(fn);
  }
  function info() {
    return { code, status, lastOkAt };
  }

  return { start, run, connect, disconnect, generateCode, normalize, onStatus, info };
})();
