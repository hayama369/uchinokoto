/* =========================================================
   ui.js ― 画面で何度も使う部品（見出しつきの箱・チップ・チェック など）
   ========================================================= */

const UI = (() => {
  const h = U.h;

  // 小さな黒猫アイコン（ハルのレイヤーの印）
  const CAT_MARK = '<svg viewBox="4 4 92 122" aria-hidden="true"><path d="M33 121 C29 95 37 68 60 60 C83 68 91 95 87 121 Z"/><path d="M37 38 L39 9 L57 26 Z"/><path d="M83 38 L81 9 L63 26 Z"/><ellipse cx="60" cy="45" rx="25" ry="22"/></svg>';

  /** 見出しつきの箱 */
  function card(title, action, ...children) {
    return h('section', { class: 'card' },
      h('header', { class: 'card-head' }, h('h2', null, title), action || null),
      ...children);
  }

  /** 見出しの右に置く小さなリンク風ボタン */
  function more(label, onclick) {
    return h('button', { type: 'button', class: 'link', onclick }, label);
  }

  /** レイヤー（だれの予定か）の印：色＋記号（色だけに頼らない） */
  function mark(key) {
    const el = h('span', { class: 'mark mark-' + key, 'aria-hidden': 'true' });
    if (key === 'haru') el.innerHTML = CAT_MARK;
    else el.textContent = (Model.layer(key) || {}).mark || '◆';
    return el;
  }

  /** 選択チップの列。options: [{ value, label, mark? }]。allowNone=true ならもう一度押すと解除 */
  function chips(options, current, onPick, { allowNone = false, label } = {}) {
    const box = h('div', { class: 'chips', role: 'group', 'aria-label': label || null });
    options.forEach((o) => {
      const on = current === o.value;
      box.appendChild(
        h('button', {
          type: 'button',
          class: 'chip' + (on ? ' is-on' : ''),
          'aria-pressed': on ? 'true' : 'false',
          onclick: () => onPick(allowNone && on ? null : o.value),
        }, o.mark ? mark(o.mark) : null, o.label)
      );
    });
    return box;
  }

  /** チェックボタン（丸） */
  function check(checked, onToggle, label) {
    return h('button', {
      type: 'button',
      class: 'check' + (checked ? ' is-on' : ''),
      role: 'checkbox',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': label,
      onclick: onToggle,
    });
  }

  /** 1行入力＋追加ボタン（Enterでも追加） */
  function addLine(placeholder, onAdd, { keepFocus = true, id } = {}) {
    const input = h('input', { type: 'text', class: 'field', placeholder, enterkeyhint: 'done', id, 'aria-label': placeholder, autocomplete: 'off' });
    const submit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return input.focus();
      onAdd(v);
      input.value = '';
      if (keepFocus) input.focus();
    };
    return h('form', { class: 'add-line', onsubmit: submit }, input, h('button', { type: 'submit', class: 'btn btn-solid' }, '追加'));
  }

  function empty(text) {
    return h('p', { class: 'empty' }, text);
  }

  /** 人の名前チップ（自分／夫） */
  function who(id) {
    return id ? h('span', { class: 'who' }, Model.name(id)) : null;
  }

  return { card, more, mark, chips, check, addLine, empty, who, CAT_MARK };
})();
