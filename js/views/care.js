/* =========================================================
   views/care.js ― 「ハル」画面（お世話の記録）
   ---------------------------------------------------------
   ・項目ごとに「やった」ボタンと「最後にやった日」を表示
   ・押すと「誰が・何を・いつ」を記録（取り消しできる）
   ・記録は義務ではない。必要なものだけ押せばいい
   ・「目安：毎日」にした項目だけ、今日の画面に「まだ」として出る
     （それ以外は、最後にやった日が分かるだけ）
   ========================================================= */

const CareView = (() => {
  const h = U.h;
  const HISTORY_DAYS = 14;

  function render(root) {
    root.appendChild(h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'ハル'), h('p', { class: 'note' }, 'お世話の記録。押したいものだけ押せばいい。')));

    // ---- お世話の項目 ----
    root.appendChild(h('div', { class: 'care-grid' }, Model.careItems().map((it) => {
      const last = Model.lastCare(it.id);
      const today = last && U.dayOf(last.performedAt) === U.today();
      return h('div', { class: 'care-card' + (today ? ' is-today' : '') },
        h('p', { class: 'care-title' }, it.title, it.everyDays ? h('span', { class: 'care-every' }, '毎日') : null),
        h('p', { class: 'care-last' },
          last ? [h('span', null, '最後：' + U.md(U.dayOf(last.performedAt), false)), h('span', { class: 'care-ago' }, today ? U.hm(last.performedAt) + '・' + Model.name(last.performedBy) : U.ago(last.performedAt))]
               : h('span', { class: 'muted' }, 'まだ記録なし')),
        h('button', { type: 'button', class: 'btn btn-quiet care-do', onclick: () => record(it) }, 'やった'));
    })));
    root.appendChild(h('button', { type: 'button', class: 'link', onclick: editItems }, 'お世話の項目を編集'));

    // ---- 履歴 ----
    const since = U.addDays(U.today(), -HISTORY_DAYS + 1);
    const logs = Model.careLogsSorted().filter((l) => U.dayOf(l.performedAt) >= since);
    const byDay = {};
    logs.forEach((l) => (byDay[U.dayOf(l.performedAt)] = byDay[U.dayOf(l.performedAt)] || []).push(l));
    root.appendChild(UI.card('お世話の記録', h('span', { class: 'note' }, '最近' + HISTORY_DAYS + '日'),
      logs.length
        ? Object.keys(byDay).map((d) => h('div', { class: 'log-day' },
            h('p', { class: 'log-date' }, U.md(d) + (d === U.today() ? '・今日' : '')),
            h('ul', { class: 'log-rows' }, byDay[d].map((l) => {
              const it = Store.get('careItems', l.careItemId);
              return h('li', null,
                h('span', { class: 'time' }, U.hm(l.performedAt)),
                h('span', null, it ? it.title : '（消した項目）'),
                UI.who(l.performedBy),
                h('button', { type: 'button', class: 'link small', 'aria-label': '記録を消す', onclick: () => removeLog(l) }, '消す'));
            }))))
        : UI.empty('まだ記録はない。')));

    Haru.setScene('bowl');
  }

  /** 「やった」を記録（今日の画面からも呼ばれる） */
  function record(item) {
    const log = Store.put('careLogs', { careItemId: item.id, performedBy: Model.whoami(), performedAt: Date.now() });
    Toast.show(item.title + '、記録した。', () => Store.remove('careLogs', log.id));
  }

  function removeLog(l) {
    Store.remove('careLogs', l.id);
    Toast.show('記録を消した。', () => Store.put('careLogs', { ...l, deleted: false }));
  }

  // ---------------------------------------------------------
  // 項目の編集（名前・毎日の目安・削除・追加）
  // ---------------------------------------------------------
  function editItems() {
    Sheet.open('お世話の項目', itemsBody());
  }

  function itemsBody() {
    const refresh = () => Sheet.replace('お世話の項目', itemsBody());
    const items = Model.careItems();
    return h('div', { class: 'care-edit' },
      h('p', { class: 'note' }, '「毎日」にした項目は、その日まだなら今日の画面に出る。'),
      h('ul', { class: 'rows' }, items.map((it) => {
        const input = h('input', { class: 'field', type: 'text', 'aria-label': '項目の名前' });
        input.value = it.title;
        input.addEventListener('change', () => input.value.trim() && Store.put('careItems', { id: it.id, title: input.value.trim() }));
        let armed = false;
        const del = h('button', { type: 'button', class: 'link small danger', onclick: () => {
          if (!armed) { armed = true; del.textContent = '本当に消す'; return; }
          Store.remove('careItems', it.id);
          refresh();
        } }, '消す');
        return h('li', { class: 'care-edit-row' }, input,
          h('button', { type: 'button', class: 'chip' + (it.everyDays ? ' is-on' : ''), 'aria-pressed': it.everyDays ? 'true' : 'false',
            onclick: () => { Store.put('careItems', { id: it.id, everyDays: it.everyDays ? null : 1 }); refresh(); } }, '毎日'),
          del);
      })),
      UI.addLine('項目を足す（例：歯みがき）', (title) => {
        Store.put('careItems', { title, everyDays: null, order: items.length });
        refresh();
      }, { keepFocus: false }));
  }

  return { render, record };
})();
