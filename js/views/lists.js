/* =========================================================
   views/lists.js ― 「リスト」画面
   ---------------------------------------------------------
   上の切り替えで4つのリストを行き来します。
     やること   … 今日／今週／いつか。済んだら完了日時を記録
     買い物     … チェックで「買った」。よく買うものからワンタップで再追加
     ほしいもの … 画像・価格・URL・誰が・優先度・メモ（すべて任意）
     やりたいこと … 叶ったら「叶ったもの」として日付つきで残す
   ========================================================= */

const ListsView = (() => {
  const h = U.h;
  const TABS = [
    { key: 'tasks', label: 'やること' },
    { key: 'shopping', label: '買い物' },
    { key: 'wishes', label: 'ほしいもの' },
    { key: 'dreams', label: 'やりたいこと' },
  ];
  let tab = U.pref('listTab', 'tasks');

  function setTab(t) {
    if (t) {
      tab = t;
      U.setPref('listTab', t);
    }
  }

  function render(root) {
    root.appendChild(h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'リスト')));
    root.appendChild(h('div', { class: 'segmented', role: 'tablist' }, TABS.map((t) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': tab === t.key ? 'true' : 'false', class: tab === t.key ? 'is-on' : '', onclick: () => { setTab(t.key); App.render(); } }, t.label))));

    if (tab === 'tasks') renderTasks(root);
    if (tab === 'shopping') renderShopping(root);
    if (tab === 'wishes') renderWishes(root);
    if (tab === 'dreams') renderDreams(root);

    Haru.setScene(tab === 'shopping' ? 'bag' : tab === 'wishes' || tab === 'dreams' ? 'look' : 'wander');
  }

  // =========================================================
  // やること
  // =========================================================
  function renderTasks(root) {
    root.appendChild(UI.addLine('やることを足す（今日）', (title) => Store.put('tasks', { title, bucket: 'today' }), { id: 'add-task' }));
    const open = Store.all('tasks').filter((x) => !x.completedAt).sort((a, b) => a.createdAt - b.createdAt);
    Forms.BUCKETS.forEach((b) => {
      const items = open.filter((x) => (x.bucket || 'someday') === b.value);
      if (!items.length) return;
      root.appendChild(UI.card(b.label, null, h('ul', { class: 'rows' }, items.map(taskRow))));
    });
    if (!open.length) root.appendChild(UI.empty('いま、やることはない。'));

    const done = Store.all('tasks').filter((x) => x.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 30);
    if (done.length) root.appendChild(doneBox('済んだもの', done.map((x) => h('li', { class: 'check-row is-done' },
      UI.check(true, () => Store.put('tasks', { id: x.id, completedAt: null, completedBy: null }), x.title + 'を未完了に戻す'),
      h('span', { class: 'row-title' }, x.title),
      h('span', { class: 'row-sub' }, U.md(U.dayOf(x.completedAt), false) + (x.completedBy ? '・' + Model.name(x.completedBy) : ''))))));
  }

  function taskRow(x) {
    const meta = [];
    if (x.assignee) meta.push(Model.name(x.assignee));
    if (x.dueDate) meta.push('期限 ' + U.md(x.dueDate, false));
    return h('li', { class: 'check-row' },
      UI.check(false, () => TodayView.complete(x), x.title + 'を済んだにする'),
      h('button', { type: 'button', class: 'row-title row-link', onclick: () => Forms.edit('task', x) }, x.title),
      meta.length ? h('span', { class: 'row-sub' }, meta.join('・')) : null);
  }

  // =========================================================
  // 買い物
  // =========================================================
  function renderShopping(root) {
    root.appendChild(UI.addLine('買うものを足す', (title) => Store.put('shopping', { title }), { id: 'add-shopping' }));
    const open = Model.shoppingOpen();
    root.appendChild(open.length
      ? UI.card('買うもの', h('span', { class: 'count' }, open.length + '件'), h('ul', { class: 'rows' }, open.map((s) => h('li', { class: 'check-row' },
          UI.check(false, () => buy(s), s.title + 'を買ったにする'),
          h('button', { type: 'button', class: 'row-title row-link', onclick: () => Forms.edit('shopping', s) }, s.title)))))
      : UI.empty('買うものはない。'));

    // よく買うもの
    const freq = Model.frequentShopping();
    if (freq.length) {
      root.appendChild(UI.card('よく買うもの', null, h('div', { class: 'chips wrap' }, freq.map((title) =>
        h('button', { type: 'button', class: 'chip', onclick: () => { Store.put('shopping', { title }); Toast.show(title + 'を足した。'); } }, '＋ ' + title)))));
    }

    const bought = Store.all('shopping').filter((s) => s.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 30);
    if (bought.length) root.appendChild(doneBox('買ったもの', bought.map((s) => h('li', { class: 'check-row is-done' },
      UI.check(true, () => Store.put('shopping', { id: s.id, completedAt: null, purchasedBy: null }), s.title + 'を買うものに戻す'),
      h('span', { class: 'row-title' }, s.title),
      h('span', { class: 'row-sub' }, U.md(U.dayOf(s.completedAt), false) + (s.purchasedBy ? '・' + Model.name(s.purchasedBy) : ''))))));
  }

  function buy(s) {
    Store.put('shopping', { id: s.id, completedAt: Date.now(), purchasedBy: Model.whoami() });
    Toast.show('買った。', () => Store.put('shopping', { id: s.id, completedAt: null, purchasedBy: null }));
  }

  // =========================================================
  // ほしいもの
  // =========================================================
  function renderWishes(root) {
    root.appendChild(UI.addLine('ほしいものを足す', (title) => Store.put('wishes', { title }), { id: 'add-wish' }));
    const order = { high: 0, mid: 1, low: 2 };
    const open = Store.all('wishes').filter((w) => !w.purchasedAt)
      .sort((a, b) => (order[a.priority] ?? 1.5) - (order[b.priority] ?? 1.5) || b.createdAt - a.createdAt);
    root.appendChild(open.length ? h('ul', { class: 'wish-list' }, open.map(wishCard)) : UI.empty('ほしいものはまだない。'));

    const got = Store.all('wishes').filter((w) => w.purchasedAt).sort((a, b) => b.purchasedAt - a.purchasedAt);
    if (got.length) root.appendChild(doneBox('買ったもの', got.map((w) => h('li', { class: 'check-row is-done' },
      UI.check(true, () => Store.put('wishes', { id: w.id, purchasedAt: null }), w.title + 'を未購入に戻す'),
      h('span', { class: 'row-title' }, w.title),
      h('span', { class: 'row-sub' }, U.md(U.dayOf(w.purchasedAt), false))))));
  }

  // ほしいもの1件（細い行。画像は登録したときだけ小さく出す）
  function wishCard(w) {
    const pr = Forms.PRIORITIES.find((p) => p.value === w.priority);
    const safeUrl = /^https?:\/\//i.test(w.url || '') ? w.url : null;
    return h('li', { class: 'wish-row' },
      h('button', { type: 'button', class: 'wish-main', onclick: () => Forms.edit('wish', w, { extra: boughtButton(w) }) },
        w.image ? h('img', { src: w.image, alt: '', class: 'wish-thumb' }) : null,
        h('span', { class: 'wish-text' },
          h('span', { class: 'wish-title' }, w.title),
          h('span', { class: 'wish-meta' },
            w.price ? h('span', null, priceText(w.price)) : null,
            w.owner ? h('span', null, Model.name(w.owner)) : null,
            pr ? h('span', { class: 'tag' }, pr.label) : null))),
      safeUrl ? h('a', { class: 'btn btn-quiet btn-small wish-link', href: safeUrl, target: '_blank', rel: 'noopener noreferrer' }, shopName(safeUrl) + 'で見る') : null);
  }

  function boughtButton(w) {
    return h('button', { type: 'button', class: 'btn btn-quiet btn-wide', onclick: () => {
      Store.put('wishes', { id: w.id, purchasedAt: Date.now() });
      Sheet.close();
      Toast.show('買ったものに移した。');
    } }, '買った');
  }

  function priceText(p) {
    const n = String(p).replace(/[,，円¥\s]/g, '');
    return /^\d+$/.test(n) ? '¥' + Number(n).toLocaleString('ja-JP') : String(p);
  }
  function shopName(url) {
    if (/amazon\.|amzn\./i.test(url)) return 'Amazon';
    if (/rakuten\./i.test(url)) return '楽天';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return 'サイト';
    }
  }

  // =========================================================
  // やりたいこと
  // =========================================================
  function renderDreams(root) {
    root.appendChild(UI.addLine('やりたいことを足す', (title) => Store.put('dreams', { title }), { id: 'add-dream' }));
    const open = Store.all('dreams').filter((d) => !d.completedAt).sort((a, b) => b.createdAt - a.createdAt);
    root.appendChild(open.length
      ? h('ul', { class: 'rows card-like' }, open.map((d) => {
          const cat = Forms.DREAM_CATS.find((c) => c.value === d.category);
          return h('li', { class: 'check-row' },
            UI.check(false, () => {
              Store.put('dreams', { id: d.id, completedAt: Date.now() });
              Toast.show('叶った。', () => Store.put('dreams', { id: d.id, completedAt: null }));
            }, d.title + 'を叶ったにする'),
            h('button', { type: 'button', class: 'row-title row-link', onclick: () => Forms.edit('dream', d) }, d.title),
            cat ? h('span', { class: 'tag' }, cat.label) : null);
        }))
      : UI.empty('やりたいことはまだない。'));

    const done = Store.all('dreams').filter((d) => d.completedAt).sort((a, b) => b.completedAt - a.completedAt);
    if (done.length) root.appendChild(doneBox('叶ったもの', done.map((d) => h('li', { class: 'check-row is-done' },
      UI.check(true, () => Store.put('dreams', { id: d.id, completedAt: null }), d.title + 'を戻す'),
      h('span', { class: 'row-title' }, d.title),
      h('span', { class: 'row-sub' }, U.md(U.dayOf(d.completedAt), false))))));
  }

  // 済んだ・買った・叶ったものの折りたたみ（開いた状態は描き直しても保つ）
  const openBoxes = new Set();
  function doneBox(title, items) {
    const key = tab + ':' + title;
    return h('details', { class: 'done-box', open: openBoxes.has(key), ontoggle: (e) => (e.target.open ? openBoxes.add(key) : openBoxes.delete(key)) },
      h('summary', null, title, h('span', { class: 'count' }, String(items.length))), h('ul', { class: 'rows' }, items));
  }

  return { render, setTab };
})();
