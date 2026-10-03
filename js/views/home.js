/* =========================================================
   views/home.js ― 「うち」画面（設定まわり）
   ---------------------------------------------------------
   ・家族の名前
   ・この端末は誰？（「やった」「買った」を誰の名前で記録するか）
   ・夫の休みの登録（月の表で日付を押すだけ）
   ・合言葉（家族と共有）
   ========================================================= */

const HomeView = (() => {
  const h = U.h;
  let offYm = null; // 休み登録の表で表示している月
  let showCode = false;

  function render(root) {
    root.appendChild(h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'うち')));
    root.appendChild(namesCard());
    root.appendChild(whoCard());
    root.appendChild(offCard());
    root.appendChild(shareCard());
    root.appendChild(h('p', { class: 'note about' }, 'データはこの端末に保存される。合言葉でつなぐと、同じ合言葉の端末どうしで共有される。'));
    Haru.setScene('wander');
  }

  // ---------- 家族の名前 ----------
  function namesCard() {
    const p = Model.people();
    const field = (id, label) => {
      const input = h('input', { class: 'field', type: 'text', id: 'name-' + id, autocomplete: 'off' });
      input.value = (p[id] && p[id].name) || '';
      input.addEventListener('change', () => {
        const name = input.value.trim();
        if (!name) return;
        const cur = Model.people();
        Store.put('settings', { id: 'family', people: { ...cur, [id]: { ...(cur[id] || {}), name } } });
      });
      return h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'name-' + id }, label), input);
    };
    return UI.card('家族の名前', null, h('div', { class: 'form-fields two' }, field('me', '自分'), field('partner', 'パートナー')));
  }

  // ---------- この端末は誰？ ----------
  function whoCard() {
    return UI.card('この端末を使うのは', null,
      UI.chips([{ value: 'me', label: Model.name('me') }, { value: 'partner', label: Model.name('partner') }], Model.whoami(), (v) => {
        if (v) U.setPref('whoami', v);
        App.render();
      }, { label: 'この端末を使う人' }),
      h('p', { class: 'note' }, '「やった」「買った」を押したとき、この名前で残る。'));
  }

  // ---------- 夫の休み ----------
  function offCard() {
    if (!offYm) {
      const d = U.parse(U.today());
      offYm = [d.getFullYear(), d.getMonth() + 1];
    }
    const [y, m] = offYm;
    const partner = Model.name('partner');
    const days = U.monthGrid(y, m);
    const count = days.filter((d) => U.parse(d).getMonth() + 1 === m && Model.isOff('partner', d)).length;
    const grid = h('div', { class: 'mini-cal' },
      ['日', '月', '火', '水', '木', '金', '土'].map((w) => h('span', { class: 'mini-week' }, w)),
      days.map((d) => {
        const date = U.parse(d);
        if (date.getMonth() + 1 !== m) return h('span', { class: 'mini-blank' });
        const off = Model.isOff('partner', d);
        return h('button', {
          type: 'button', class: 'mini-day' + (off ? ' is-off' : '') + (d === U.today() ? ' is-today' : ''),
          'aria-pressed': off ? 'true' : 'false', 'aria-label': U.md(d) + (off ? ' 休み' : ''),
          onclick: () => Model.toggleOff('partner', d),
        }, String(date.getDate()), off ? h('span', { class: 'mini-off' }, '休') : null);
      }));
    const move = (n) => {
      let [yy, mm] = offYm;
      mm += n;
      if (mm < 1) { mm = 12; yy--; }
      if (mm > 12) { mm = 1; yy++; }
      offYm = [yy, mm];
      App.render();
    };
    return UI.card(partner + 'の休み', null,
      h('p', { class: 'note' }, '休みの日を押す。もう一度押すと外れる。'),
      h('div', { class: 'mini-head' },
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '前の月', onclick: () => move(-1) }, '‹'),
        h('p', null, y + '年' + m + '月', h('span', { class: 'note' }, '　休み ' + count + '日')),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': '次の月', onclick: () => move(1) }, '›')),
      grid,
      h('p', { class: 'note' }, '勤務表（CSV・ICS）の取り込みは次の段階で作る。'));
  }

  // ---------- 合言葉 ----------
  function shareCard() {
    const { code, status, lastOkAt } = Sync.info();
    if (!code) {
      const input = h('input', { class: 'field', type: 'text', id: 'join-code', placeholder: '例：haru-yoru-tsuki-4821', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
      return UI.card('合言葉（家族と共有）', null,
        h('p', { class: 'note' }, '同じ合言葉を入れた端末どうしで、予定・リスト・お世話の記録が共有される。'),
        h('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: () => {
          const c = Sync.generateCode();
          showCode = true;
          Sync.connect(c);
          App.render();
        } }, '新しく合言葉を作る'),
        h('p', { class: 'or' }, 'または'),
        h('form', { class: 'add-line', onsubmit: (e) => {
          e.preventDefault();
          const c = Sync.normalize(input.value);
          if (c.length < 8) return Toast.show('合言葉は8文字以上。');
          Sync.connect(c);
          App.render();
        } }, h('label', { class: 'visually-hidden', for: 'join-code' }, '家族の合言葉'), input, h('button', { type: 'submit', class: 'btn btn-solid' }, 'つなぐ')));
    }

    const label = {
      idle: 'つないでいる…', syncing: '同期中…', ok: '共有中', offline: 'オフライン（つながったら送る）',
      'not-configured': '共有の置き場所がまだ準備されていない（READMEの「合言葉の準備」を見て）', error: 'うまく同期できなかった。少ししてもう一度試す。',
    }[status] || '';
    const codeText = h('code', { class: 'code' + (showCode ? '' : ' is-hidden') }, showCode ? code : '••••-••••-••••');
    let armed = false;
    const leave = h('button', { type: 'button', class: 'link small danger', onclick: () => {
      if (!armed) { armed = true; leave.textContent = '本当にやめる（この端末のデータは残る）'; return; }
      Sync.disconnect();
      App.render();
    } }, 'この端末の共有をやめる');

    return UI.card('合言葉（家族と共有）', null,
      h('p', { class: 'sync-status sync-' + status }, h('span', { class: 'dot', 'aria-hidden': 'true' }), label,
        lastOkAt && status === 'ok' ? h('span', { class: 'note' }, '　' + U.hm(lastOkAt)) : null),
      h('div', { class: 'code-row' }, codeText,
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => { showCode = !showCode; App.render(); } }, showCode ? '隠す' : '見る'),
        h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => copy(code) }, 'コピー')),
      h('p', { class: 'note' }, '家族の端末で、この合言葉を「つなぐ」に入れる。合言葉を知っている人は誰でも中身を見られるので、家族以外には教えない。'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-quiet btn-small', onclick: () => Sync.run() }, '今すぐ同期'), leave));
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => Toast.show('コピーした。'), () => Toast.show('コピーできなかった。「見る」で表示して書き写して。'));
    } else {
      Toast.show('コピーできなかった。「見る」で表示して書き写して。');
    }
  }

  return { render };
})();
