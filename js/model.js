/* =========================================================
   model.js ― 「うちのデータ」の読み方をまとめたファイル
   ---------------------------------------------------------
   画面から使う問い合わせ：
     ・夫は今日休み？ 次の休みはいつ？ 何連休？
     ・その日の予定（レイヤーの表示切り替えつき）
     ・今日やること、お世話の「最後にやった日」
     ・今日のことが一通り済んだか（ハルが寝るかどうか）
   記録が抜けている日があっても、エラーにせず「分からない」として扱います。
   ========================================================= */

const Model = (() => {
  // ---------- 人とレイヤー ----------
  // 予定の「だれの」。色だけでなく記号と文字でも見分けられるようにしている
  const LAYERS = [
    { key: 'me', label: () => name('me'), mark: '●' },
    { key: 'partner', label: () => name('partner'), mark: '■' },
    { key: 'family', label: () => '家族', mark: '◆' },
    { key: 'house', label: () => '家', mark: '▲' },
    { key: 'haru', label: () => 'ハル', mark: 'ハ' },
  ];
  const OFF_LAYER = { key: 'off', label: () => name('partner') + 'の休み', mark: '休' };

  function people() {
    const s = Store.get('settings', 'family');
    return (s && s.people) || { me: { name: '自分' }, partner: { name: '夫' } };
  }
  /** 'me' / 'partner' の表示名 */
  function name(id) {
    if (id === 'either') return 'どちらでも';
    if (id === 'family') return '家族';
    const p = people()[id];
    return (p && p.name) || (id === 'me' ? '自分' : id === 'partner' ? '夫' : '');
  }
  function layer(key) {
    return LAYERS.find((l) => l.key === key) || LAYERS[2];
  }
  /** この端末を使っているのは誰か（'me' / 'partner'） */
  function whoami() {
    return U.pref('whoami', 'me');
  }
  /** 表示中のレイヤー */
  function visibleLayers() {
    return U.pref('layers', { me: true, partner: true, family: true, house: true, haru: true, off: true });
  }

  // ---------- 夫の勤務（WorkSchedule） ----------
  // 記録の id は「人:日付」。休みの日だけ登録すれば十分。
  function workOn(personId, ymd) {
    return Store.get('workdays', personId + ':' + ymd);
  }
  function isOff(personId, ymd) {
    const w = workOn(personId, ymd);
    return !!(w && w.type === 'off');
  }
  /** 休みの登録を切り替える（手動） */
  function toggleOff(personId, ymd) {
    const id = personId + ':' + ymd;
    if (isOff(personId, ymd)) Store.remove('workdays', id);
    else Store.put('workdays', { id, personId, date: ymd, type: 'off', source: 'manual' });
  }
  /** ymd から続く休みの日数（連休） */
  function offRun(personId, ymd) {
    let n = 0;
    while (n < 60 && isOff(personId, U.addDays(ymd, n))) n++;
    return n;
  }
  /** 今日を除いた「次の休み」：{ start, end, days } か null */
  function nextOff(personId, from = U.today()) {
    let d = U.addDays(from, 1);
    // 今日が休みなら、今の連休が終わってから探す
    while (isOff(personId, U.addDays(d, -1)) && isOff(personId, d) && U.diffDays(from, d) < 60) d = U.addDays(d, 1);
    for (let i = 0; i < 400; i++, d = U.addDays(d, 1)) {
      if (isOff(personId, d)) {
        const days = offRun(personId, d);
        return { start: d, end: U.addDays(d, days - 1), days };
      }
    }
    return null;
  }
  /** 休みが1日でも登録されているか */
  function hasAnyWork(personId) {
    return Store.all('workdays').some((w) => w.personId === personId);
  }

  // ---------- 予定 ----------
  function sortEvents(list) {
    return list.sort((a, b) => (a.time || '99') .localeCompare(b.time || '99') || a.createdAt - b.createdAt);
  }
  /** その日の予定（表示中のレイヤーだけ） */
  function eventsOn(ymd, layers = visibleLayers()) {
    return sortEvents(Store.all('events').filter((e) => e.date === ymd && layers[e.owner || 'family'] !== false));
  }

  // ---------- やること ----------
  /** 今日見るべきやること（「今日」に入れたもの＋期限が今日までのもの） */
  function todayTasks() {
    const t = U.today();
    return Store.all('tasks').filter((x) => !x.completedAt && (x.bucket === 'today' || (x.dueDate && x.dueDate <= t)));
  }
  function doneToday(list, field = 'completedAt') {
    return list.filter((x) => x[field] && U.dayOf(x[field]) === U.today());
  }

  // ---------- 買い物 ----------
  function shoppingOpen() {
    return Store.all('shopping').filter((s) => !s.completedAt).sort((a, b) => a.createdAt - b.createdAt);
  }
  /** よく買うもの（買った回数の多い順。いまリストにあるものは除く） */
  function frequentShopping(limit = 12) {
    const open = new Set(shoppingOpen().map((s) => s.title));
    const count = {};
    Store.all('shopping').forEach((s) => {
      if (s.completedAt && !open.has(s.title)) count[s.title] = (count[s.title] || 0) + 1;
    });
    return Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, limit);
  }

  // ---------- ハルのお世話 ----------
  function careItems() {
    return Store.all('careItems').sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  function lastCare(itemId) {
    let last = null;
    Store.all('careLogs').forEach((l) => {
      if (l.careItemId === itemId && (!last || l.performedAt > last.performedAt)) last = l;
    });
    return last;
  }
  /** 「目安」がある項目で、今日まだ済んでいないもの */
  function careDue() {
    return careItems().filter((it) => {
      if (!it.everyDays) return false;
      const last = lastCare(it.id);
      if (!last) return true;
      return U.diffDays(U.dayOf(last.performedAt), U.today()) >= it.everyDays;
    });
  }
  function careLogsSorted() {
    return Store.all('careLogs').sort((a, b) => b.performedAt - a.performedAt);
  }

  // ---------- ハルが寝るかどうか ----------
  /** 今日のこと（やること・目安のあるお世話・これからの予定）が一通り済んでいるか */
  function allDoneToday() {
    if (todayTasks().length) return false;
    if (careDue().length) return false;
    const now = new Date();
    const nowHM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const upcoming = eventsOn(U.today()).filter((e) => e.time && e.time > nowHM);
    return upcoming.length === 0;
  }

  return {
    LAYERS, OFF_LAYER, people, name, layer, whoami, visibleLayers,
    workOn, isOff, toggleOff, offRun, nextOff, hasAnyWork,
    eventsOn, sortEvents, todayTasks, doneToday,
    shoppingOpen, frequentShopping,
    careItems, lastCare, careDue, careLogsSorted,
    allDoneToday,
  };
})();
