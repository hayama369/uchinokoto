/* =========================================================
   forms.js ― 追加・編集の入力欄（クイック追加もここ）
   ---------------------------------------------------------
   ・種類ごとに「どんな項目があるか」を TYPES にまとめています。
     項目を足したいときは、ここに1行足せば追加画面・編集画面の両方に出ます。
   ・quick: true の項目だけが「＋」のクイック追加に出ます。
     それ以外は、あとから編集画面で入れられます（入力必須は「名前」だけ）。
   ========================================================= */

const Forms = (() => {
  const h = U.h;

  // 選択肢
  const OWNER_OPTIONS = () => Model.LAYERS.map((l) => ({ value: l.key, label: l.label(), mark: l.key }));
  const BUCKETS = [
    { value: 'today', label: '今日' },
    { value: 'week', label: '今週' },
    { value: 'someday', label: 'いつか' },
  ];
  const ASSIGNEES = () => [
    { value: 'me', label: Model.name('me') },
    { value: 'partner', label: Model.name('partner') },
    { value: 'either', label: 'どちらでも' },
  ];
  const WISH_OWNERS = () => [
    { value: 'me', label: Model.name('me') },
    { value: 'partner', label: Model.name('partner') },
    { value: 'family', label: '家族' },
  ];
  const PRIORITIES = [
    { value: 'high', label: 'いちばん欲しい' },
    { value: 'mid', label: '欲しい' },
    { value: 'low', label: 'いつか' },
  ];
  const DREAM_CATS = [
    { value: 'go', label: '行きたい' },
    { value: 'eat', label: '食べたい' },
    { value: 'see', label: '見たい' },
    { value: 'family', label: '家族でやりたい' },
    { value: 'make', label: '作りたい' },
  ];

  // 種類ごとの項目
  const TYPES = {
    event: {
      col: 'events', label: '予定',
      fields: [
        { key: 'title', label: '予定', type: 'text', placeholder: '例：病院', quick: true },
        { key: 'date', label: '日付', type: 'date', quick: true, default: () => U.today() },
        { key: 'time', label: '時間（なくてもいい）', type: 'time', quick: true },
        { key: 'owner', label: 'だれの', type: 'chips', options: OWNER_OPTIONS, quick: true, default: () => 'family' },
        { key: 'note', label: 'メモ', type: 'textarea' },
      ],
    },
    task: {
      col: 'tasks', label: 'やること',
      fields: [
        { key: 'title', label: 'やること', type: 'text', placeholder: '例：書類を出す', quick: true },
        { key: 'bucket', label: 'いつ', type: 'chips', options: () => BUCKETS, quick: true, default: () => 'today' },
        { key: 'assignee', label: 'だれが（なくてもいい）', type: 'chips', options: ASSIGNEES, allowNone: true, quick: true },
        { key: 'dueDate', label: '期限（なくてもいい）', type: 'date' },
      ],
    },
    shopping: {
      col: 'shopping', label: '買い物',
      fields: [{ key: 'title', label: '買うもの', type: 'text', placeholder: '例：牛乳', quick: true }],
    },
    wish: {
      col: 'wishes', label: 'ほしいもの',
      fields: [
        { key: 'title', label: '商品名', type: 'text', placeholder: '例：電気毛布', quick: true },
        { key: 'url', label: 'URL（Amazon・楽天など）', type: 'url', placeholder: 'https://', quick: true },
        { key: 'price', label: '価格', type: 'text', placeholder: '例：3980' },
        { key: 'owner', label: 'だれが欲しい', type: 'chips', options: WISH_OWNERS, allowNone: true },
        { key: 'priority', label: '優先度', type: 'chips', options: () => PRIORITIES, allowNone: true },
        { key: 'note', label: 'メモ', type: 'textarea' },
        { key: 'image', label: '画像（なくてもいい。見た目で覚えておきたいときだけ）', type: 'image' },
      ],
    },
    dream: {
      col: 'dreams', label: 'やりたいこと',
      fields: [
        { key: 'title', label: 'やりたいこと', type: 'text', placeholder: '例：紅葉を見に行く', quick: true },
        { key: 'category', label: '種類（なくてもいい）', type: 'chips', options: () => DREAM_CATS, allowNone: true, quick: true },
        { key: 'note', label: 'メモ', type: 'textarea' },
      ],
    },
  };

  // ---------------------------------------------------------
  // 項目を並べる。戻り値：{ el: 入力欄のまとまり, read(): 入力された値 }
  // ---------------------------------------------------------
  function build(fields, values) {
    const v = { ...values };
    const box = h('div', { class: 'form-fields' });
    fields.forEach((f) => {
      if (v[f.key] === undefined && f.default) v[f.key] = f.default();
      const id = 'f-' + f.key + '-' + Math.random().toString(36).slice(2, 7);
      let control;
      if (f.type === 'chips') {
        const slot = h('div');
        const draw = () => {
          slot.textContent = '';
          slot.appendChild(UI.chips(f.options(), v[f.key] || null, (val) => { v[f.key] = val; draw(); }, { allowNone: f.allowNone, label: f.label }));
        };
        draw();
        control = slot;
      } else if (f.type === 'textarea') {
        control = h('textarea', { id, class: 'field', rows: '3', oninput: (e) => (v[f.key] = e.target.value) });
        control.value = v[f.key] || '';
      } else if (f.type === 'image') {
        control = imageField(v, f.key);
      } else {
        control = h('input', {
          id, class: 'field', type: f.type === 'url' ? 'url' : f.type, placeholder: f.placeholder || null,
          enterkeyhint: f.key === 'title' ? 'done' : null, autocomplete: 'off',
          oninput: (e) => (v[f.key] = e.target.value),
        });
        control.value = v[f.key] || '';
      }
      box.appendChild(h('div', { class: 'form-row' }, f.type === 'chips' || f.type === 'image' ? h('p', { class: 'form-label' }, f.label) : h('label', { class: 'form-label', for: id }, f.label), control));
    });
    return { el: box, read: () => v };
  }

  // 画像：選ぶと 480px まで縮めて保存（家族と共有するため、軽くしておく）
  function imageField(v, key) {
    const wrap = h('div', { class: 'image-field' });
    const draw = () => {
      wrap.textContent = '';
      if (v[key]) {
        wrap.appendChild(h('img', { src: v[key], alt: '', class: 'image-preview' }));
        wrap.appendChild(h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { v[key] = null; draw(); } }, '画像を外す'));
      }
      const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', onchange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          v[key] = await shrinkImage(file, 480);
          draw();
        } catch (err) {
          Toast.show('画像を読めなかった。');
        }
      } });
      wrap.appendChild(h('label', { class: 'btn btn-quiet' }, input, v[key] ? '画像を変える' : '画像を選ぶ'));
    };
    draw();
    return wrap;
  }

  function shrinkImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------
  // クイック追加（「＋」ボタン）
  // ---------------------------------------------------------
  /** type: 'event' / 'task' / 'shopping' / 'wish' / 'dream'。values で初期値（日付など） */
  function quickAdd(type = 'task', values = {}) {
    const body = h('div', { class: 'quick' });
    const draw = (t) => {
      body.textContent = '';
      // 種類の切り替え
      body.appendChild(UI.chips(Object.entries(TYPES).map(([k, d]) => ({ value: k, label: d.label })), t, (nt) => nt && draw(nt), { label: '種類' }));
      body.appendChild(h('button', { type: 'button', class: 'link', onclick: () => MoneyView.openEntry() }, 'お金を記録する →'));
      const spec = TYPES[t];
      const form = build(spec.fields.filter((f) => f.quick), values);
      const added = h('p', { class: 'note', 'aria-live': 'polite' });
      const submit = (e) => {
        e.preventDefault();
        const v = form.read();
        if (!(v.title || '').trim()) return body.querySelector('input').focus();
        Store.put(spec.col, clean({ ...v, title: v.title.trim() }));
        if (t === 'shopping') {
          // 買い物は続けて足すことが多いので、開いたままにする
          added.textContent = '追加した：' + v.title.trim();
          const input = body.querySelector('input');
          input.value = '';
          form.read().title = '';
          input.focus();
        } else {
          Sheet.close();
          Toast.show(spec.label + 'に追加した。');
        }
      };
      body.appendChild(h('form', { class: 'quick-form', onsubmit: submit }, form.el, h('button', { type: 'submit', class: 'btn btn-primary btn-wide' }, '追加'), added));
      const first = body.querySelector('input');
      if (first) setTimeout(() => first.focus(), 30);
    };
    Sheet.open('追加する', body);
    draw(type);
  }

  // ---------------------------------------------------------
  // 編集
  // ---------------------------------------------------------
  function edit(type, rec, { extra } = {}) {
    const spec = TYPES[type];
    const form = build(spec.fields, rec);
    let armed = false;
    const del = h('button', { type: 'button', class: 'btn btn-ghost danger', onclick: () => {
      if (!armed) {
        armed = true;
        del.textContent = '本当に削除する';
        return;
      }
      Store.remove(spec.col, rec.id);
      Sheet.close();
      Toast.show('削除した。');
    } }, '削除');
    const save = (e) => {
      e.preventDefault();
      const v = form.read();
      if (!(v.title || '').trim()) return;
      Store.put(spec.col, clean({ ...v, id: rec.id, title: v.title.trim() }));
      Sheet.close();
    };
    const body = h('form', { class: 'edit-form', onsubmit: save },
      form.el,
      extra || null,
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, '保存'), del));
    Sheet.open(spec.label, body);
  }

  // 空の文字は保存しない
  function clean(v) {
    const out = {};
    Object.entries(v).forEach(([k, val]) => (out[k] = typeof val === 'string' ? val.trim() || null : val));
    return out;
  }

  return { TYPES, BUCKETS, DREAM_CATS, PRIORITIES, quickAdd, edit, build };
})();
