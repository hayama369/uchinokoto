/* =========================================================
   views/today.js ― 「今日」画面（アプリを開いて最初に出る画面）
   ---------------------------------------------------------
   今日この家で何があるかだけを、小さくまとめて出します。
   ・日付
   ・今日の予定 / 今日のやること / 買い物 / ハルのお世話
   中身がない欄は出しません（予定だけは「ない」と一言出す）。
   （休みの表示は 2026-10-16 にここから外した。休みの登録は「うち」、表示はカレンダーに残っている）
   ========================================================= */

const TodayView = (() => {
  const h = U.h;

  function render(root) {
    const t = U.today();
    root.appendChild(h('header', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, '今日'),
      h('h1', { class: 'date-title' }, U.md(t))));

    // ---- 今日の予定 ----
    const events = Model.eventsOn(t, { me: true, partner: true, family: true, house: true, haru: true });
    root.appendChild(UI.card('今日の予定', UI.more('＋', () => Forms.quickAdd('event', { date: t })),
      events.length
        ? h('ul', { class: 'rows' }, events.map((e) => h('li', null,
            h('button', { type: 'button', class: 'row-btn', onclick: () => Forms.edit('event', e) },
              h('span', { class: 'time' }, e.time || '—'), UI.mark(e.owner || 'family'), h('span', { class: 'row-title' }, e.title)))))
        : UI.empty('予定はない。')));

    // ---- 今日のやること ----
    const tasks = Model.todayTasks();
    const doneTasks = Model.doneToday(Store.all('tasks'));
    if (tasks.length || doneTasks.length) {
      root.appendChild(UI.card('今日のやること', null,
        h('ul', { class: 'rows' }, tasks.map((x) => h('li', { class: 'check-row' },
          UI.check(false, () => complete(x), x.title + 'を済んだにする'),
          h('button', { type: 'button', class: 'row-title row-link', onclick: () => Forms.edit('task', x) }, x.title),
          UI.who(x.assignee && x.assignee !== 'either' ? x.assignee : null)))),
        doneTasks.length ? h('p', { class: 'note' }, '済んだ：' + doneTasks.map((x) => x.title).join('、')) : null));
    }

    // ---- 買い物 ----
    const shop = Model.shoppingOpen();
    if (shop.length) {
      root.appendChild(UI.card('買い物', UI.more('リストへ', () => App.go('lists', 'shopping')),
        h('p', { class: 'shop-line' }, shop.slice(0, 8).map((s) => h('span', { class: 'tag' }, s.title)), shop.length > 8 ? h('span', { class: 'note' }, 'ほか' + (shop.length - 8) + '件') : null)));
    }

    // ---- お金 ----
    root.appendChild(MoneyView.todayCard());

    // ---- ハルのお世話 ----
    const due = Model.careDue();
    const doneCare = Model.careLogsSorted().filter((l) => U.dayOf(l.performedAt) === t);
    if (due.length || doneCare.length) {
      root.appendChild(UI.card('ハルのお世話', UI.more('ハルへ', () => App.go('care')),
        due.length ? h('div', { class: 'care-quick' }, due.map((it) => h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => CareView.record(it) }, it.title, h('span', { class: 'btn-sub' }, 'やった')))) : null,
        doneCare.length ? h('ul', { class: 'log-rows' }, doneCare.slice(0, 6).map((l) => {
          const it = Store.get('careItems', l.careItemId);
          return h('li', null, h('span', { class: 'time' }, U.hm(l.performedAt)), h('span', null, it ? it.title : '（消した項目）'), UI.who(l.performedBy));
        })) : null));
    }

    Haru.setScene(Model.allDoneToday() ? 'sleep' : 'wander');
  }

  // やることを済んだにする（取り消しできる）
  function complete(task) {
    Store.put('tasks', { id: task.id, completedAt: Date.now(), completedBy: Model.whoami() });
    Toast.show('済んだ。', () => Store.put('tasks', { id: task.id, completedAt: null, completedBy: null }));
  }

  return { render, complete };
})();
