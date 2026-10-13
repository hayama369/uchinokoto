/* =========================================================
   views/money.js ― 「お金」画面（家計簿）
   ---------------------------------------------------------
   入力はなるべく少なく：
     ・「記録する」→ 分類を押す → 金額を打つ → 「記録する」
     ・分類を選ばなければ「その他」。日付は今日。どちらもあとで直せる
     ・同じ記録を2回すると「いつもの」に出て、押すだけで記録できる
   記録するとコインと肉球がはじけて、ハルがはねる。
   今月の記録が増えるほど、ハルの横の貯金びんにコインがたまる。

   【コレクション】
     moneyLogs  … { kind: 'out'(支出) | 'in'(収入) | 'save'(貯金), amount, catId, date, memo, by }
     moneyCats  … { kind: 'out' | 'in', title, order }
     moneyFixed … { title, amount }（毎月そのまま数える）
     settings の id:'money' … { budget(月の予算・固定費のぞく), goalTitle, goalAmount, sound }
   ========================================================= */

const MoneyView = (() => {
  const h = U.h;
  let ym = null; // 表示している月 [年, 月]
  let selDay = null; // 日ごとのグラフで選んでいる日（0始まり）

  const KIND_LABEL = { out: '支出', in: '収入', save: '貯金' };
  const yen = (n) => '¥' + Math.round(n || 0).toLocaleString('ja-JP');
  const short = (n) => (n >= 10000 ? (Math.round(n / 1000) / 10).toFixed(1).replace(/\.0$/, '') + '万' : yen(n));
  const toNum = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
  const key = (y, m) => y + '-' + String(m).padStart(2, '0');
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const thisKey = () => U.today().slice(0, 7);

  // ---------------------------------------------------------
  // データの読み方
  // ---------------------------------------------------------
  function settings() {
    return Store.get('settings', 'money') || {};
  }
  function setSettings(patch) {
    Store.put('settings', { id: 'money', ...patch });
  }
  function goalTitle() {
    return settings().goalTitle || '貯金';
  }
  function curYm() {
    if (!ym) {
      const d = U.parse(U.today());
      ym = [d.getFullYear(), d.getMonth() + 1];
    }
    return ym;
  }
  function cats(kind) {
    return Store.all('moneyCats')
      .filter((c) => (c.kind || 'out') === kind)
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  function catName(id) {
    const c = id && Store.get('moneyCats', id);
    return c ? c.title : 'その他';
  }
  const defaultCat = (kind) => 'mc-' + kind + '-other';
  function logs() {
    return Store.all('moneyLogs').filter((l) => l.date && +l.amount > 0);
  }
  function logsOf(y, m) {
    const k = key(y, m);
    return logs().filter((l) => l.date.slice(0, 7) === k);
  }
  const total = (list, kind) => list.reduce((s, l) => s + (l.kind === kind ? +l.amount || 0 : 0), 0);
  function fixedTotal() {
    return Store.all('moneyFixed').reduce((s, f) => s + (+f.amount || 0), 0);
  }
  function labelOf(l) {
    return l.kind === 'save' ? goalTitle() : catName(l.catId);
  }

  /** 「いつもの」：直近60日で2回以上あった 種類＋分類＋金額 */
  function usual(limit = 4) {
    const since = U.addDays(U.today(), -60);
    const map = new Map();
    logs().filter((l) => l.date >= since).forEach((l) => {
      const k = l.kind + '|' + (l.catId || '') + '|' + l.amount;
      const cur = map.get(k) || { kind: l.kind, catId: l.catId || null, amount: +l.amount, count: 0, last: 0 };
      cur.count++;
      cur.last = Math.max(cur.last, l.createdAt || 0);
      map.set(k, cur);
    });
    return [...map.values()].filter((u) => u.count >= 2).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, limit);
  }

  function centerOf(el) {
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }

  // ---------------------------------------------------------
  // 記録する（＋ごほうび）
  // ---------------------------------------------------------
  function record(entry, at) {
    const rec = Store.put('moneyLogs', {
      kind: entry.kind,
      amount: entry.amount,
      catId: entry.kind === 'save' ? null : entry.catId || defaultCat(entry.kind),
      date: entry.date || U.today(),
      memo: entry.memo || null,
      by: Model.whoami(),
    });
    const count = rec.date.slice(0, 7) === thisKey() ? logsOf(...curNow()).length : 0;
    const milestone = count > 0 && count % 10 === 0;
    Toast.show(labelOf(rec) + ' ' + yen(rec.amount) + ' を記録した。' + (milestone ? '今月' + count + '件目！' : ''), () => Store.remove('moneyLogs', rec.id));
    Fx.burst(at, milestone ? 30 : 14);
    if (settings().sound !== false) Fx.chime(milestone);
    Haru.cheer(rec.kind === 'save' ? 'にゃーん！' : rec.kind === 'in' ? 'にゃ♪' : ['にゃっ', 'にゃ', 'んにゃ'][Math.floor(Math.random() * 3)]);
    return rec;
  }
  function curNow() {
    const d = U.parse(U.today());
    return [d.getFullYear(), d.getMonth() + 1];
  }

  function usualChip(u) {
    return h('button', {
      type: 'button', class: 'chip usual-chip',
      onclick: (e) => record({ kind: u.kind, amount: u.amount, catId: u.catId, date: U.today() }, centerOf(e.currentTarget)),
    }, labelOf(u), h('span', { class: 'usual-amt' }, yen(u.amount)));
  }

  // ---------------------------------------------------------
  // 電卓シート（新しく記録 / 記録を直す）
  // ---------------------------------------------------------
  function openEntry(rec, preset) {
    const editing = !!rec;
    const s = {
      kind: 'out', catId: null, amount: '', date: U.today(), memo: '',
      ...(preset || {}),
      ...(rec ? { kind: rec.kind, catId: rec.catId, amount: String(rec.amount), date: rec.date, memo: rec.memo || '' } : {}),
    };
    let memoOpen = !!s.memo;
    const body = h('div', { class: 'pad-wrap' });
    const amountEl = h('p', { class: 'pad-amount', 'aria-live': 'polite' });
    const showAmount = () => {
      const n = toNum(s.amount);
      amountEl.textContent = yen(n);
      amountEl.classList.toggle('is-zero', !n);
    };

    const press = (k) => {
      if (k === 'back') s.amount = s.amount.slice(0, -1);
      else {
        const next = (s.amount + k).replace(/^0+/, '');
        if (next.length <= 9) s.amount = next;
      }
      showAmount();
    };

    const submit = () => {
      const amount = toNum(s.amount);
      if (!amount) {
        amountEl.classList.remove('is-shake');
        void amountEl.offsetWidth;
        amountEl.classList.add('is-shake');
        return;
      }
      const at = centerOf(body.querySelector('.btn-record'));
      const memo = (s.memo || '').trim() || null;
      Sheet.close();
      if (editing) {
        Store.put('moneyLogs', { id: rec.id, kind: s.kind, amount, catId: s.kind === 'save' ? null : s.catId || defaultCat(s.kind), date: s.date, memo });
        Toast.show('直した。');
        return;
      }
      record({ kind: s.kind, amount, catId: s.catId, date: s.date, memo }, at);
    };

    const draw = () => {
      body.textContent = '';
      // 支出・収入・貯金
      body.appendChild(h('div', { class: 'segmented three', role: 'group', 'aria-label': '種類' },
        ['out', 'in', 'save'].map((k) => h('button', {
          type: 'button', class: s.kind === k ? 'is-on' : null, 'aria-pressed': s.kind === k ? 'true' : 'false',
          onclick: () => {
            if (s.kind === k) return;
            s.kind = k;
            s.catId = null;
            draw();
          },
        }, KIND_LABEL[k]))));

      body.appendChild(amountEl);
      showAmount();

      // 分類（選ばなければ「その他」）
      if (s.kind === 'save') {
        body.appendChild(h('p', { class: 'note' }, '貯金先：' + goalTitle()));
      } else {
        body.appendChild(UI.chips(cats(s.kind).map((c) => ({ value: c.id, label: c.title })), s.catId, (v) => { s.catId = v; draw(); }, { allowNone: true, label: '分類' }));
      }

      // 数字
      body.appendChild(h('div', { class: 'pad' },
        ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back'].map((k) =>
          h('button', { type: 'button', 'aria-label': k === 'back' ? '1けた消す' : null, onclick: () => press(k) }, k === 'back' ? '⌫' : k))));

      body.appendChild(h('button', { type: 'button', class: 'btn btn-primary btn-wide btn-record', onclick: submit }, editing ? '保存' : '記録する'));

      // 日付（ふだんは今日のままでいい）
      const t = U.today();
      const dateInput = h('input', { type: 'date', class: 'field', id: 'money-date', 'aria-label': 'ほかの日', onchange: (e) => { if (e.target.value) { s.date = e.target.value; draw(); } } });
      dateInput.value = s.date;
      body.appendChild(h('div', { class: 'pad-dates' },
        UI.chips([[t, '今日'], [U.addDays(t, -1), '昨日'], [U.addDays(t, -2), 'おととい']].map(([value, label]) => ({ value, label })), s.date, (v) => { if (v) { s.date = v; draw(); } }, { label: '日付' }),
        dateInput));

      // メモ（必要なときだけ）
      if (memoOpen) {
        const m = h('input', {
          type: 'text', class: 'field', id: 'money-memo', placeholder: 'メモ（なくてもいい）', autocomplete: 'off', enterkeyhint: 'done',
          oninput: (e) => (s.memo = e.target.value),
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } },
        });
        m.value = s.memo;
        body.appendChild(m);
      } else {
        body.appendChild(h('button', { type: 'button', class: 'link', onclick: () => { memoOpen = true; draw(); const m = body.querySelector('#money-memo'); if (m) m.focus(); } }, '＋ メモを足す'));
      }

      if (editing) {
        let armed = false;
        const del = h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: () => {
          if (!armed) { armed = true; del.textContent = '本当に削除する'; return; }
          Store.remove('moneyLogs', rec.id);
          Sheet.close();
          Toast.show('削除した。', () => Store.put('moneyLogs', { ...rec }));
        } }, '削除');
        body.appendChild(del);
      }
    };

    // パソコンでは数字キー・Backspace・Enter でも打てる
    const onKey = (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    };
    document.addEventListener('keydown', onKey);
    Sheet.open(editing ? '記録を直す' : 'お金を記録', body, () => document.removeEventListener('keydown', onKey));
    draw();
  }

  // ---------------------------------------------------------
  // 画面
  // ---------------------------------------------------------
  function render(root) {
    const [y, m] = curYm();
    const k = key(y, m);
    const isNow = k === thisKey();
    const isPast = k < thisKey();
    const list = logsOf(y, m);
    const out = total(list, 'out');
    const inc = total(list, 'in');
    const save = total(list, 'save');
    const fixed = fixedTotal();
    const st = settings();
    const nDays = daysIn(y, m);
    const todayIdx = isNow ? U.parse(U.today()).getDate() : isPast ? nDays : 0;

    // ---- 見出しと月の切り替え ----
    root.appendChild(h('header', { class: 'page-head cal-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'お金'), h('h1', { class: 'month-title' }, y + '年' + m + '月')),
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '前の月', onclick: () => move(-1) }, '‹'),
        isNow ? null : h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { ym = null; selDay = null; App.render(); } }, '今月'),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '次の月', onclick: () => move(1) }, '›'))));

    // ---- 記録する ----
    const us = usual();
    root.appendChild(h('div', { class: 'money-hero' },
      h('button', { type: 'button', class: 'btn btn-primary btn-wide btn-record', onclick: () => openEntry() }, '記録する'),
      us.length
        ? h('div', { class: 'usual' }, h('p', { class: 'form-label' }, 'いつもの（押すだけで記録）'), h('div', { class: 'chips' }, us.map(usualChip)))
        : h('p', { class: 'note' }, '同じ記録を2回すると、ここに「いつもの」が出る。押すだけで記録できる。')));

    // ---- 今月のまとめ ----
    const budget = +st.budget || 0;
    const sum = [h('p', { class: 'big-sub' }, '使ったお金（固定費のぞく）'), h('p', { class: 'big-num' }, yen(out))];
    if (budget) {
      const left = budget - out;
      const over = left < 0;
      const daysLeft = isNow ? nDays - todayIdx + 1 : 0;
      sum.push(
        h('div', { class: 'meter' + (over ? ' is-over' : ''), role: 'img', 'aria-label': '予算' + yen(budget) + 'のうち' + yen(out) + '使った' },
          h('span', { class: 'meter-fill', style: { width: Math.min(100, (out / budget) * 100) + '%' } }),
          isNow ? h('span', { class: 'meter-pace', style: { left: (todayIdx / nDays) * 100 + '%' } }) : null),
        h('div', { class: 'meter-legend' }, h('span', null, '予算 ' + yen(budget)), isNow ? h('span', null, '縦線＝今日までの目安') : null),
        h('p', { class: 'money-left' + (over ? ' is-over' : '') },
          over ? '予算を ' + yen(-left) + ' こえた' : 'あと ' + yen(left),
          !over && isNow && daysLeft > 0 ? h('span', { class: 'note' }, '　1日あたり ' + yen(Math.floor(left / daysLeft)) + '（残り' + daysLeft + '日）') : null));
    } else {
      sum.push(h('button', { type: 'button', class: 'link', onclick: () => {
        const el = document.getElementById('money-budget');
        if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
      } }, '月の予算を決める →'));
    }
    const stats = [['固定費', fixed, '毎月'], ['収入', inc], ['貯金', save]];
    if (inc) stats.push(['手元に残る', inc - out - fixed - save]);
    sum.push(h('div', { class: 'stat-grid' }, stats.map(([label, v, note]) => h('div', { class: 'stat' },
      h('span', { class: 'stat-label' }, label, note ? h('span', { class: 'stat-note' }, '　' + note) : null),
      h('span', { class: 'stat-value' + (v < 0 ? ' is-neg' : '') }, (v < 0 ? '−' : '') + yen(Math.abs(v)))))));
    root.appendChild(UI.card(isNow ? '今月' : m + '月のまとめ', null, ...sum));

    // ---- 毎日の支出（記録するたびに棒が育つ） ----
    const perDay = Array.from({ length: nDays }, () => 0);
    list.forEach((l) => { if (l.kind === 'out') perDay[+l.date.slice(8, 10) - 1] += +l.amount; });
    const max = Math.max(0, ...perDay);
    if (max > 0 || isNow) {
      const dayYmd = (i) => k + '-' + String(i + 1).padStart(2, '0');
      const cap = h('p', { class: 'chart-cap', 'aria-live': 'polite' });
      const setCap = (i) => { cap.textContent = U.md(dayYmd(i)) + '　' + yen(perDay[i]); };
      if (selDay !== null && selDay < nDays) setCap(selDay);
      else if (isNow) setCap(todayIdx - 1);
      else cap.textContent = '棒を押すと、その日の金額が出る。';
      const bars = h('div', { class: 'daybars', style: '--n:' + nDays, role: 'group', 'aria-label': '日ごとの支出' },
        perDay.map((v, i) => h('button', {
          type: 'button',
          class: 'daybar' + (isNow && i + 1 === todayIdx ? ' is-today' : '') + (selDay === i ? ' is-sel' : ''),
          'aria-label': (i + 1) + '日 ' + yen(v),
          disabled: isNow && i + 1 > todayIdx,
          onmouseenter: () => setCap(i),
          onfocus: () => setCap(i),
          onclick: (e) => {
            selDay = i;
            setCap(i);
            bars.querySelectorAll('.is-sel').forEach((b) => b.classList.remove('is-sel'));
            e.currentTarget.classList.add('is-sel');
          },
        }, h('span', { style: { height: v ? 'max(3px, ' + (v / max) * 100 + '%)' : '0' } }))));
      const ticks = new Set([1, 10, 20, nDays]);
      root.appendChild(UI.card('毎日の支出', null,
        cap,
        h('p', { class: 'chart-max' }, max ? '上の線＝いちばん多い日 ' + yen(max) : 'まだ記録がない。記録するとここに棒が育つ。'),
        bars,
        h('div', { class: 'day-axis', style: '--n:' + nDays, 'aria-hidden': 'true' }, perDay.map((_, i) => h('span', null, ticks.has(i + 1) ? String(i + 1) : '')))));
    }

    // ---- 分類ごと ----
    const byCat = new Map();
    list.filter((l) => l.kind === 'out').forEach((l) => {
      const id = l.catId && Store.get('moneyCats', l.catId) ? l.catId : defaultCat('out');
      byCat.set(id, (byCat.get(id) || 0) + +l.amount);
    });
    const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    if (rows.length) {
      root.appendChild(UI.card('分類ごと', null,
        h('ul', { class: 'cat-rows' }, rows.map(([id, v]) => h('li', { class: 'cat-row' },
          h('span', { class: 'cat-name' }, catName(id)),
          h('span', { class: 'cat-bar', 'aria-hidden': 'true' }, h('span', { style: { width: (v / rows[0][1]) * 100 + '%' } })),
          h('span', { class: 'cat-amt' }, yen(v), h('span', { class: 'cat-pct' }, Math.round((v / out) * 100) + '%'))))),
        h('p', { class: 'note' }, '固定費はここには入らない。')));
    }

    // ---- 月ごと（6か月） ----
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let mm = m - i;
      let yy = y;
      while (mm < 1) { mm += 12; yy--; }
      months.push([yy, mm]);
    }
    const mv = months.map(([yy, mm]) => total(logsOf(yy, mm), 'out'));
    if (mv.filter((v) => v > 0).length >= 2) {
      const mx = Math.max(...mv);
      root.appendChild(UI.card('月ごとの支出', null,
        h('div', { class: 'monthbars', role: 'img', 'aria-label': months.map(([, mm], i) => mm + '月 ' + yen(mv[i])).join('、') },
          months.map(([, mm], i) => h('div', { class: 'mbar' + (i === 5 ? ' is-cur' : '') },
            h('span', { class: 'mbar-v' }, mv[i] ? short(mv[i]) : '—'),
            h('span', { class: 'mbar-b', style: { height: mv[i] ? Math.max(3, (mv[i] / mx) * 80) + 'px' : '0' } }),
            h('span', { class: 'mbar-m' }, mm + '月')))),
        h('p', { class: 'note' }, '固定費のぞく。')));
    }

    // ---- 貯金 ----
    const saved = total(logs(), 'save');
    const goal = +st.goalAmount || 0;
    root.appendChild(UI.card('貯金', UI.more('＋ 貯金する', () => openEntry(null, { kind: 'save' })),
      h('p', { class: 'big-sub' }, goalTitle() + '（これまでの合計）'),
      h('p', { class: 'big-num' }, yen(saved)),
      goal
        ? [
            h('div', { class: 'meter', role: 'img', 'aria-label': '目標' + yen(goal) + 'のうち' + yen(saved) },
              h('span', { class: 'meter-fill save', style: { width: Math.min(100, (saved / goal) * 100) + '%' } })),
            h('p', { class: 'note' }, '目標 ' + yen(goal) + '　' + (saved >= goal ? '達成！' : 'あと ' + yen(goal - saved)) + '（' + Math.min(100, Math.floor((saved / goal) * 100)) + '%）'),
          ]
        : h('p', { class: 'note' }, '下の設定で目標を決めると、どこまで貯まったか見える。')));

    // ---- 記録の一覧 ----
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const days = [];
    sorted.forEach((l) => {
      const last = days[days.length - 1];
      if (last && last[0] === l.date) last[1].push(l);
      else days.push([l.date, [l]]);
    });
    root.appendChild(UI.card('記録', h('span', { class: 'count' }, sorted.length + '件'),
      days.length
        ? days.map(([d, items]) => h('div', { class: 'log-day' },
            h('p', { class: 'log-date' }, U.md(d) + (total(items, 'out') ? '　支出 ' + yen(total(items, 'out')) : '')),
            h('ul', { class: 'rows' }, items.map((l) => h('li', null,
              h('button', { type: 'button', class: 'row-btn money-row', onclick: () => openEntry(l) },
                h('span', { class: 'row-title' }, labelOf(l), l.memo ? h('span', { class: 'money-memo' }, l.memo) : null),
                UI.who(l.by),
                h('span', { class: 'amt ' + l.kind }, (l.kind === 'out' ? '−' : l.kind === 'in' ? '＋' : '貯 ') + yen(l.amount))))))))
        : UI.empty('まだ記録がない。「記録する」から最初の1件をどうぞ。')));

    // ---- 設定 ----
    root.appendChild(settingsCard(st));

    // ハル：貯金びんのとなり。今月の記録が多いほどびんがいっぱい（30件で満杯）
    Haru.setJar(logsOf(...curNow()).length / 30);
    Haru.setScene('jar');
  }

  function move(n) {
    let [yy, mm] = curYm();
    mm += n;
    if (mm < 1) { mm = 12; yy--; }
    if (mm > 12) { mm = 1; yy++; }
    ym = [yy, mm];
    selDay = null;
    App.render();
  }

  // ---------------------------------------------------------
  // 設定（予算・固定費・分類・貯金の目標・音）
  // ---------------------------------------------------------
  function yenInput(id, value, onSet, placeholder) {
    const el = h('input', { type: 'text', inputmode: 'numeric', class: 'field yen-field', id, placeholder: placeholder || '例：60000', autocomplete: 'off', enterkeyhint: 'done' });
    el.value = value ? String(value) : '';
    if (onSet) el.addEventListener('change', () => onSet(toNum(el.value)));
    return el;
  }

  function settingsCard(st) {
    // 予算
    const budget = h('div', { class: 'set-block' },
      h('label', { class: 'set-h', for: 'money-budget' }, '月の予算（固定費のぞく）'),
      yenInput('money-budget', st.budget, (v) => setSettings({ budget: v || null })));

    // 固定費
    const fixed = Store.all('moneyFixed').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const fTitle = h('input', { type: 'text', class: 'field', id: 'fixed-title', placeholder: '例：家賃', autocomplete: 'off', 'aria-label': '固定費の名前' });
    const fAmount = yenInput('fixed-amount', null, null, '金額');
    fAmount.setAttribute('aria-label', '固定費の金額');
    const fixedBlock = h('div', { class: 'set-block' },
      h('p', { class: 'set-h' }, '固定費（毎月そのまま数える）　合計 ' + yen(fixedTotal())),
      fixed.length
        ? h('ul', { class: 'rows' }, fixed.map((f) => h('li', null,
            h('button', { type: 'button', class: 'row-btn', onclick: () => editFixed(f) },
              h('span', { class: 'row-title' }, f.title), h('span', { class: 'amt' }, yen(f.amount))))))
        : null,
      h('form', { class: 'money-pair', onsubmit: (e) => {
        e.preventDefault();
        const title = fTitle.value.trim();
        const amount = toNum(fAmount.value);
        if (!title) return fTitle.focus();
        if (!amount) return fAmount.focus();
        Store.put('moneyFixed', { title, amount });
        Toast.show('固定費に足した。');
      } }, fTitle, fAmount, h('button', { type: 'submit', class: 'btn btn-solid' }, '追加')));

    // 分類
    const catBlock = (kind, label) => h('div', { class: 'set-block' },
      h('p', { class: 'set-h' }, label + 'の分類（押すと名前を変えられる）'),
      h('div', { class: 'chips' }, cats(kind).map((c) => h('button', { type: 'button', class: 'chip', onclick: () => editCat(c) }, c.title))),
      UI.addLine('分類を足す', (title) => Store.put('moneyCats', { kind, title, order: 50 }), { keepFocus: false, id: 'add-cat-' + kind }));

    // 貯金の目標
    const gTitle = h('input', { type: 'text', class: 'field', id: 'goal-title', placeholder: '例：旅行', autocomplete: 'off', 'aria-label': '貯金の名前' });
    gTitle.value = st.goalTitle || '';
    gTitle.addEventListener('change', () => setSettings({ goalTitle: gTitle.value.trim() || null }));
    const gAmount = yenInput('goal-amount', st.goalAmount, (v) => setSettings({ goalAmount: v || null }), '目標の金額');
    gAmount.setAttribute('aria-label', '貯金の目標金額');
    const goalBlock = h('div', { class: 'set-block' },
      h('p', { class: 'set-h' }, '貯金の名前と目標'),
      h('div', { class: 'money-pair two' }, gTitle, gAmount));

    // 音
    const soundOn = st.sound !== false;
    const sound = h('button', {
      type: 'button', class: 'toggle-row' + (soundOn ? ' is-on' : ''), role: 'switch', 'aria-checked': soundOn ? 'true' : 'false',
      onclick: () => setSettings({ sound: !soundOn }),
    }, h('span', { 'aria-hidden': 'true' }, '♪'), h('span', null, '記録したときのチャリン音'), h('span', { class: 'switch', 'aria-hidden': 'true' }));

    return UI.card('お金の設定', null, budget, fixedBlock, catBlock('out', '支出'), catBlock('in', '収入'), goalBlock, sound);
  }

  function editFixed(f) {
    const title = h('input', { type: 'text', class: 'field', id: 'edit-fixed-title', autocomplete: 'off' });
    title.value = f.title || '';
    const amount = yenInput('edit-fixed-amount', f.amount);
    let armed = false;
    const del = h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: () => {
      if (!armed) { armed = true; del.textContent = '本当に削除する'; return; }
      Store.remove('moneyFixed', f.id);
      Sheet.close();
      Toast.show('削除した。');
    } }, '削除');
    Sheet.open('固定費', h('form', { class: 'edit-form', onsubmit: (e) => {
      e.preventDefault();
      if (!title.value.trim() || !toNum(amount.value)) return;
      Store.put('moneyFixed', { id: f.id, title: title.value.trim(), amount: toNum(amount.value) });
      Sheet.close();
    } },
      h('div', { class: 'form-fields' },
        h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'edit-fixed-title' }, '名前'), title),
        h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'edit-fixed-amount' }, '毎月の金額'), amount)),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, '保存'), del)));
  }

  function editCat(c) {
    const title = h('input', { type: 'text', class: 'field', id: 'edit-cat-title', autocomplete: 'off' });
    title.value = c.title || '';
    const isOther = c.id === defaultCat(c.kind || 'out');
    let armed = false;
    const del = isOther ? null : h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: () => {
      if (!armed) { armed = true; del.textContent = '本当に削除する（記録は「その他」になる）'; return; }
      Store.remove('moneyCats', c.id);
      Sheet.close();
      Toast.show('分類を削除した。');
    } }, '削除');
    Sheet.open('分類', h('form', { class: 'edit-form', onsubmit: (e) => {
      e.preventDefault();
      if (!title.value.trim()) return;
      Store.put('moneyCats', { id: c.id, title: title.value.trim() });
      Sheet.close();
    } },
      h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'edit-cat-title' }, '名前'), title),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, '保存'), del)));
  }

  // ---------------------------------------------------------
  // 「今日」画面に出す小さな箱
  // ---------------------------------------------------------
  function todayCard() {
    const t = U.today();
    const spent = total(logs().filter((l) => l.date === t), 'out');
    return UI.card('今日のお金', UI.more('お金へ', () => App.go('money')),
      h('p', { class: 'today-money' }, '今日使った', h('strong', null, yen(spent))),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip chip-go', onclick: () => openEntry() }, '＋ 記録する'),
        usual(3).map(usualChip)));
  }

  return { render, openEntry, todayCard };
})();
