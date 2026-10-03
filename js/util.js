/* =========================================================
   util.js ― どこからでも使う小道具（日付・画面部品の作り方）
   ---------------------------------------------------------
   日付は「2026-10-03」の形の文字（ymd）で扱います。
   時差や夏時間でずれないよう、時刻つきの Date はなるべく使いません。
   ========================================================= */

const U = (() => {
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  // ---------- 日付 ----------
  function ymd(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() {
    return ymd(new Date());
  }
  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 12); // 正午にしておくと日付がずれない
  }
  function addDays(s, n) {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  /** b - a の日数 */
  function diffDays(a, b) {
    return Math.round((parse(b) - parse(a)) / 86400000);
  }
  function weekday(s) {
    return WEEK[parse(s).getDay()];
  }
  function isWeekend(s) {
    const w = parse(s).getDay();
    return w === 0 || w === 6;
  }
  /** 「10月5日（月）」 */
  function md(s, withWeek = true) {
    const d = parse(s);
    return d.getMonth() + 1 + '月' + d.getDate() + '日' + (withWeek ? '（' + WEEK[d.getDay()] + '）' : '');
  }
  /** 「今日」「明日」「あと3日」 */
  function until(s) {
    const n = diffDays(today(), s);
    if (n === 0) return '今日';
    if (n === 1) return '明日';
    if (n === 2) return 'あさって';
    return n > 0 ? 'あと' + n + '日' : -n + '日前';
  }
  /** 「今日」「昨日」「3日前」（時刻の数値から） */
  function ago(ms) {
    const n = diffDays(ymd(new Date(ms)), today());
    if (n <= 0) return '今日';
    if (n === 1) return '昨日';
    return n + '日前';
  }
  /** 「9:05」 */
  function hm(ms) {
    const d = new Date(ms);
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  /** 時刻の数値 → その日の ymd */
  function dayOf(ms) {
    return ymd(new Date(ms));
  }
  /** その月のカレンダーに並べる日付（日曜始まり・6週分） */
  function monthGrid(year, month) {
    const first = new Date(year, month - 1, 1, 12);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(ymd(d));
    }
    return days;
  }

  // ---------- その他 ----------
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 画面部品を作る：h('button', { class: 'btn', onclick: fn }, '文字', 子要素…)
   * 文字はすべて textContent として入るので、入力された文字がそのまま安全に表示されます。
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v; // アイコンのSVGなど、決まった中身だけに使う
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    children.flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }

  // 端末ごとの設定（この端末は誰か、表示するレイヤーなど）
  function pref(key, fallback) {
    try {
      const v = localStorage.getItem('uchi.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function setPref(key, value) {
    try {
      localStorage.setItem('uchi.' + key, JSON.stringify(value));
    } catch (e) {
      /* 保存できなくても動作は続ける */
    }
  }

  return { ymd, today, parse, addDays, diffDays, weekday, isWeekend, md, until, ago, hm, dayOf, monthGrid, uid, h, pref, setPref };
})();
