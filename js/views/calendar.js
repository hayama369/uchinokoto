/* =========================================================
   views/calendar.js ― 月のカレンダーと、日付の詳細
   ---------------------------------------------------------
   ・1日に出す予定は最大2件。それ以上は「ほか○件」。
   ・夫の休みは予定とは別のデータ（workdays）から「休」として表示。
   ・上のチップでレイヤー（自分／夫／家族／家／ハル／夫の休み）を出し分け。
     この設定は端末ごとに覚えます。
   ・日付を押すと詳細（スマホは下から、PCは右から）。
   ========================================================= */

const CalendarView = (() => {
  const h = U.h;
  const MAX_IN_CELL = 2;
  let ym = null; // [年, 月]

  function render(root) {
    if (!ym) {
      const d = U.parse(U.today());
      ym = [d.getFullYear(), d.getMonth() + 1];
    }
    const [y, m] = ym;
    const layers = Model.visibleLayers();

    // ---- 月の切り替え ----
    root.appendChild(h('header', { class: 'page-head cal-head' },
      h('h1', { class: 'month-title' }, y + '年' + m + '月'),
      h('div', { class: 'cal-nav' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '前の月', onclick: () => move(-1) }, '‹'),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { ym = null; App.render(); } }, '今日'),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '次の月', onclick: () => move(1) }, '›'))));

    // ---- レイヤーの表示切り替え ----
    const all = [...Model.LAYERS, Model.OFF_LAYER];
    root.appendChild(h('div', { class: 'chips layer-chips', role: 'group', 'aria-label': '表示する予定' },
      all.map((l) => {
        const on = layers[l.key] !== false;
        return h('button', {
          type: 'button', class: 'chip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false',
          onclick: () => { U.setPref('layers', { ...layers, [l.key]: !on }); App.render(); },
        }, l.key === 'off' ? h('span', { class: 'mark mark-off', 'aria-hidden': 'true' }, '休') : UI.mark(l.key), l.label());
      })));

    // ---- 月の表 ----
    const grid = h('div', { class: 'cal-grid', role: 'grid' });
    ['日', '月', '火', '水', '木', '金', '土'].forEach((w, i) => grid.appendChild(h('div', { class: 'cal-week' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), role: 'columnheader' }, w)));
    const t = U.today();
    U.monthGrid(y, m).forEach((d) => {
      const date = U.parse(d);
      const inMonth = date.getMonth() + 1 === m;
      const events = Model.eventsOn(d, layers);
      const off = layers.off !== false && Model.isOff('partner', d);
      const cell = h('button', {
        type: 'button',
        class: 'cal-cell' + (inMonth ? '' : ' is-other') + (d === t ? ' is-today' : '') + (off ? ' is-off' : ''),
        'aria-label': U.md(d) + (off ? '、' + Model.name('partner') + '休み' : '') + (events.length ? '、予定' + events.length + '件' : ''),
        onclick: () => openDay(d),
      },
        h('span', { class: 'cal-day' + (date.getDay() === 0 ? ' sun' : date.getDay() === 6 ? ' sat' : '') }, String(date.getDate())),
        off ? h('span', { class: 'off-badge' }, '休') : null,
        h('span', { class: 'cal-events' },
          events.slice(0, MAX_IN_CELL).map((e) => h('span', { class: 'cal-ev ev-' + (e.owner || 'family') }, UI.mark(e.owner || 'family'), h('span', { class: 'cal-ev-t' }, e.title))),
          events.length > MAX_IN_CELL ? h('span', { class: 'cal-more' }, 'ほか' + (events.length - MAX_IN_CELL) + '件') : null));
      grid.appendChild(cell);
    });
    root.appendChild(grid);

    Haru.setScene('wander');
  }

  function move(n) {
    let [y, m] = ym;
    m += n;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    ym = [y, m];
    App.render();
  }

  // ---------------------------------------------------------
  // 日付の詳細
  // ---------------------------------------------------------
  function openDay(d) {
    Sheet.open(U.md(d), dayBody(d));
  }

  function dayBody(d) {
    const partner = Model.name('partner');
    const off = Model.isOff('partner', d);
    const events = Model.eventsOn(d, { me: true, partner: true, family: true, house: true, haru: true });
    const body = h('div', { class: 'day-detail' },
      // 夫の休み（押すと切り替え）
      h('button', {
        type: 'button', class: 'toggle-row' + (off ? ' is-on' : ''), role: 'switch', 'aria-checked': off ? 'true' : 'false',
        onclick: () => { Model.toggleOff('partner', d); Sheet.replace(U.md(d), dayBody(d)); },
      }, UI.mark('partner'), h('span', null, partner + '：' + (off ? '休み' : '休みにする')), h('span', { class: 'switch' })),
      events.length
        ? h('ul', { class: 'rows' }, events.map((e) => h('li', null,
            h('button', { type: 'button', class: 'row-btn', onclick: () => Forms.edit('event', e) },
              h('span', { class: 'time' }, e.time || '—'), UI.mark(e.owner || 'family'),
              h('span', { class: 'row-title' }, e.title), h('span', { class: 'row-sub' }, Model.layer(e.owner || 'family').label())))))
        : UI.empty('予定はない。'),
      h('button', { type: 'button', class: 'btn btn-quiet btn-wide', onclick: () => Forms.quickAdd('event', { date: d }) }, '＋ この日に予定を足す'));
    return body;
  }

  return { render, openDay };
})();
