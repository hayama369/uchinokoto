/* =========================================================
   app.js ― アプリ全体の流れ（起動・タブの切り替え・描き直し）
   ---------------------------------------------------------
   画面（view）は次の6つ。URLの # で切り替えます（#today など）。
     today … 今日      calendar … カレンダー   lists … リスト
     money … お金      care     … ハル         home  … うち
   データが変わったら、今の画面を描き直します（入力中は入力が終わるまで待つ）。
   ========================================================= */

const App = (() => {
  const $ = (id) => document.getElementById(id);
  const VIEWS = {
    today: TodayView,
    calendar: CalendarView,
    lists: ListsView,
    money: MoneyView,
    care: CareView,
    home: HomeView,
  };
  // 「＋」を押したとき、最初に選ばれている種類
  const QUICK_DEFAULT = { today: 'task', calendar: 'event', care: 'task', home: 'task' };
  const LIST_TYPE = { tasks: 'task', shopping: 'shopping', wishes: 'wish', dreams: 'dream' };

  let current = 'today';
  let pending = false; // 入力中に変更が来たら、入力が終わってから描き直す
  let lastDay = U.today();

  async function start() {
    await Store.init();
    Sheet.init();
    Haru.mount($('haru-lane'));

    // タブ
    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    // ＋
    $('fab').addEventListener('click', () => {
      if (current === 'money') return MoneyView.openEntry();
      const type = current === 'lists' ? LIST_TYPE[U.pref('listTab', 'tasks')] : QUICK_DEFAULT[current];
      Forms.quickAdd(type || 'task');
    });

    Store.onChange(requestRender);
    Sync.onStatus(() => current === 'home' && requestRender());
    document.getElementById('view').addEventListener('focusout', () => setTimeout(() => pending && requestRender(), 50));
    window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'today', null, true));

    // 日付が変わったら描き直す（開きっぱなしでも「今日」が正しくなるように）
    setInterval(() => {
      if (U.today() !== lastDay) {
        lastDay = U.today();
        render();
      }
    }, 60000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && render());

    Sync.start();
    go(location.hash.slice(1) || 'today', null, true);
    Sync.run();
  }

  /** 画面を切り替える。sub はリストのタブなど */
  function go(view, sub, fromHash) {
    if (!VIEWS[view]) view = 'today';
    if (view === 'lists' && sub) ListsView.setTab(sub);
    const changed = view !== current;
    current = view;
    if (!fromHash && location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
    document.querySelectorAll('[data-view]').forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    render();
    if (changed) window.scrollTo(0, 0);
  }

  function requestRender() {
    const active = document.activeElement;
    if (active && $('view').contains(active) && active.matches('input, textarea')) {
      pending = true; // 入力中は待つ
      return;
    }
    render();
  }

  /** 今の画面を描き直す（スクロール位置は保つ） */
  function render() {
    pending = false;
    const root = $('view');
    const y = window.scrollY;
    root.textContent = '';
    root.dataset.view = current;
    try {
      VIEWS[current].render(root);
    } catch (e) {
      console.error(e);
      root.appendChild(U.h('p', { class: 'empty' }, 'この画面をうまく表示できなかった。もう一度開き直してみて。'));
    }
    window.scrollTo(0, y);
  }

  return { start, go, render };
})();

App.start();
