/* =========================================================
   views/today.js ― 「今日」画面（アプリを開いて最初に出る画面）
   ---------------------------------------------------------
   今日この家で何があるかだけを、小さくまとめて出します。
   ・日付と、夫の状態（休みのときだけ）
   ・次の夫の休み
   ・今日の予定 / 今日のやること / 買い物 / ハルのお世話
   中身がない欄は出しません（予定だけは「ない」と一言出す）。
   ========================================================= */

const TodayView = (() => {
  const h = U.h;

  function render(root) {
    const t = U.today();
    const partner = Model.name('partner');
    root.appendChild(h('header', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, '今日'),
      h('h1', { class: 'date-title' }, U.md(t))));

    // ---- 夫の状態と次の休み ----
    const status = h('div', { class: 'status-row' });
    if (Model.isOff('partner', t)) {
      const run = Model.offRun('partner', t);
      status.appendChild(h('p', { class: 'status-pill is-off' }, UI.mark('partner'), partner + '：休み' + (run > 1 ? '（' + run + '連休）' : '')));
    } else if (Model.workOn('partner', t)) {
      status.appendChild(h('p', { class: 'status-pill' }, UI.mark('partner'), partner + '：仕事'));
    }
    if (Model.hasAnyWork('partner')) {
      const next = Model.nextOff('partner', t);
      status.appendChild(next
        ? h('div', { class: 'next-off' },
            h('p', { class: 'next-off-label' }, '次の' + partner + 'の休み'),
            h('p', { class: 'next-off-date' },
              U.md(next.start),
              next.days > 1 ? '〜' + U.md(next.end) : '',
              h('span', { class: 'next-off-until' }, U.until(next.start))),
            next.days > 1 ? h('p', { class: 'next-off-run' }, next.days + '連休') : null)
        : h('p', { class: 'note' }, '先の休みはまだ登録されていない。'));
    } else {
      status.appendChild(h('button', { type: 'button', class: 'link', onclick: () => App.go('home') }, partner + 'の休みを登録する →'));
    }
    root.appendChild(status);

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
