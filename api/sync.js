/* =========================================================
   api/sync.js ― 家族の記録を預かる、Vercel上の小さなプログラム
   ---------------------------------------------------------
   ・Vercel に置くと /api/sync で動きます（ビルド設定は不要）。
   ・保存先は Upstash Redis（Vercel の「Storage」から無料で追加できる）。
     追加すると、接続情報が環境変数に自動で入ります：
       KV_REST_API_URL / KV_REST_API_TOKEN
       （または UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）
   ・合言葉はそのまま保存せず、暗号化（SHA-256）した値を「家の置き場所の名前」にします。
     環境変数 SYNC_PEPPER に好きな文字を入れておくと、さらに推測されにくくなります（任意）。

   受け取るもの（POST / JSON）：
     { code: 合言葉, since: 前回受け取った時刻, records: [送る記録…] }
   返すもの：
     { now: サーバーの時刻, records: [since 以降に変わった記録…] }

   Redis の中身（家ごと）：
     uchi:<家>:rec  … ハッシュ。'コレクション/id' → 記録のJSON
     uchi:<家>:idx  … ソート済みセット。'コレクション/id' → 最後に書き込んだ時刻
   同じ記録が2台から届いたら、updatedAt が新しいほうを残します。
   ========================================================= */

const crypto = require('crypto');

const MAX_RECORDS = 300; // 1回に受け取る記録の上限
const MAX_RECORD_BYTES = 400 * 1024; // 1件の大きさの上限（画像つきのほしいもの対策）

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return send(res, 503, { error: 'not-configured' });

  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body || '{}');
  } catch (e) {
    return send(res, 400, { error: 'bad json' });
  }
  body = body || {};

  const code = String(body.code || '').trim().toLowerCase();
  if (code.length < 8) return send(res, 400, { error: 'code too short' });
  const since = Number(body.since) || 0;
  const incoming = Array.isArray(body.records) ? body.records.slice(0, MAX_RECORDS) : [];

  const house = crypto
    .createHash('sha256')
    .update((process.env.SYNC_PEPPER || 'uchi-no-koto') + ':' + code)
    .digest('hex')
    .slice(0, 40);
  const REC = 'uchi:' + house + ':rec';
  const IDX = 'uchi:' + house + ':idx';

  const redis = (cmds) =>
    fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    }).then(async (r) => {
      if (!r.ok) throw new Error('redis ' + r.status);
      const out = await r.json();
      return out.map((x) => {
        if (x.error) throw new Error(x.error);
        return x.result;
      });
    });

  try {
    // ---- 1. 受け取った記録を保存（新しいものだけ） ----
    const valid = incoming.filter(
      (r) =>
        r && typeof r.col === 'string' && typeof r.id === 'string' && typeof r.updatedAt === 'number' &&
        JSON.stringify(r).length <= MAX_RECORD_BYTES
    );
    if (valid.length) {
      const fields = valid.map((r) => r.col + '/' + r.id);
      const [existing] = await redis([['HMGET', REC, ...fields]]);
      const writes = [];
      const now = Date.now();
      valid.forEach((r, i) => {
        let old = null;
        try {
          old = existing[i] ? JSON.parse(existing[i]) : null;
        } catch (e) {
          old = null;
        }
        if (!old || r.updatedAt > (old.updatedAt || 0)) {
          writes.push(['HSET', REC, fields[i], JSON.stringify(r)]);
          writes.push(['ZADD', IDX, String(now), fields[i]]);
        }
      });
      if (writes.length) await redis(writes);
    }

    // ---- 2. since 以降に変わった記録を返す ----
    const [changed] = await redis([['ZRANGEBYSCORE', IDX, String(since), '+inf']]);
    let records = [];
    if (changed && changed.length) {
      const [values] = await redis([['HMGET', REC, ...changed]]);
      records = values
        .map((v) => {
          try {
            return v ? JSON.parse(v) : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
    }
    return send(res, 200, { now: Date.now(), records });
  } catch (e) {
    console.error(e);
    return send(res, 502, { error: 'storage error' });
  }
};

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
