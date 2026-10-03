/* =========================================================
   sheet.js ― 下から出てくるシート（PCでは右側のパネル）と、お知らせ
   ---------------------------------------------------------
   Sheet.open('タイトル', 中身の要素) で開き、Sheet.close() で閉じます。
   日付の詳細、クイック追加、編集画面などで共通に使います。
   ========================================================= */

const Sheet = (() => {
  const $ = (id) => document.getElementById(id);
  let onCloseFn = null;
  let lastFocus = null;

  function init() {
    $('sheet-backdrop').addEventListener('click', (e) => e.target.id === 'sheet-backdrop' && close());
    $('sheet-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => e.key === 'Escape' && isOpen() && close());
  }

  /** 開く。onClose は閉じたときに呼ばれる（任意） */
  function open(title, body, onClose) {
    lastFocus = document.activeElement;
    $('sheet-title').textContent = title;
    const box = $('sheet-body');
    box.textContent = '';
    box.appendChild(body);
    onCloseFn = onClose || null;
    $('sheet-backdrop').hidden = false;
    document.body.classList.add('is-sheet-open');
    // 最初の入力欄があればそこへ、なければ閉じるボタンへ
    const first = box.querySelector('input:not([type=checkbox]):not([type=date]):not([type=time]), textarea');
    (first || $('sheet-close')).focus();
  }

  /** 中身だけ入れ替える（開いたまま） */
  function replace(title, body) {
    $('sheet-title').textContent = title;
    $('sheet-body').textContent = '';
    $('sheet-body').appendChild(body);
  }

  function close() {
    if (!isOpen()) return;
    $('sheet-backdrop').hidden = true;
    document.body.classList.remove('is-sheet-open');
    const fn = onCloseFn;
    onCloseFn = null;
    if (fn) fn();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function isOpen() {
    return !$('sheet-backdrop').hidden;
  }

  return { init, open, replace, close, isOpen };
})();

const Toast = (() => {
  let timer = null;
  /** 数秒で消えるお知らせ。undo を渡すと「取り消し」が出る */
  function show(message, undo) {
    const box = document.getElementById('toast');
    box.textContent = '';
    box.appendChild(document.createTextNode(message));
    if (undo) {
      box.appendChild(
        U.h('button', { type: 'button', class: 'toast-undo', onclick: () => { undo(); box.hidden = true; } }, '取り消し')
      );
    }
    box.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (box.hidden = true), 4500);
  }
  return { show };
})();
