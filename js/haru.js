/* =========================================================
   haru.js ― この家に住んでいる黒猫・ハル
   ---------------------------------------------------------
   ・画面の下（タブの上）に「ハルの通り道」があり、ハルはそこだけを歩きます。
     通り道にはボタンを置かないので、ハルが操作の邪魔をしたり、
     情報を隠したりすることはありません。
   ・ハルは催促しません。何かを「やってない」と責めることもしません。

   場面（scene）ごとの過ごし方：
     wander … ゆっくり歩いて、ときどき座る（ふだん）
     bag    … 買い物袋をのぞく（買い物）
     bowl   … ごはん皿のそばに座る（ハルの画面）
     look   … 座って見上げる（ほしいもの・やりたいこと）
     sleep  … 丸くなって寝る（今日のことが一通り済んだとき）

   使い方：Haru.mount(通り道の要素) → Haru.setScene('bag') など
   形は SVG（このファイル）、色と動きは style.css の「ハル」の段。
   ========================================================= */

const Haru = (() => {
  const SPEED = 24; // 歩く速さ（px/秒）。ゆっくりめ
  const SIZE = { walk: 78, sit: 46, sleep: 74 }; // 表示する幅（px）

  // ---------- 形 ----------
  // ふち（暗い背景から浮かせる細い輪郭）→ 黒い塗り の順に重ねて描く
  const rimFill = (shapes) => `<g class="rim">${shapes}</g><g class="fill">${shapes}</g>`;

  // 横向きで歩く
  const LEGS = [38, 47, 66, 75].map((x, i) => `<rect class="leg leg-${i % 2 ? 'b' : 'a'}" x="${x}" y="50" width="7" height="23" rx="3.5"/>`).join('');
  const WALK = `
    <svg class="sprite sprite-walk" viewBox="0 0 120 80" aria-hidden="true">
      <g class="tail-walk">${rimFill('<path class="line" d="M28 44 C15 40 10 27 16 16"/>')}</g>
      ${rimFill(LEGS)}
      ${rimFill(`<ellipse cx="56" cy="46" rx="30" ry="15"/>
        <path d="M80 26 L83 10 L91 21 Z"/><path d="M92 21 L99 9 L102 26 Z"/>
        <circle cx="90" cy="33" r="14"/>`)}
      <ellipse class="eye" cx="96" cy="31.5" rx="2.6" ry="3.2"/>
      <ellipse class="pupil" cx="96.6" cy="31.5" rx="0.9" ry="2.4"/>
    </svg>`;

  // 正面を向いて座る（胸に小さなエンジェルマーク）
  const SIT = `
    <svg class="sprite sprite-sit" viewBox="0 0 120 130" aria-hidden="true">
      <g class="tail-sit">${rimFill('<path class="line" d="M40 120 C27 123 15 121 10 111"/>')}</g>
      ${rimFill(`<path d="M33 121 C29 95 37 68 60 60 C83 68 91 95 87 121 Z"/>
        <path d="M37 38 L39 9 L57 26 Z"/><path d="M83 38 L81 9 L63 26 Z"/>
        <ellipse cx="60" cy="45" rx="25" ry="22"/>`)}
      <ellipse class="angel" cx="66" cy="84" rx="2.4" ry="3.4" transform="rotate(-18 66 84)"/>
      <g class="eyes">
        <circle class="eye" cx="50" cy="46" r="5.6"/><circle class="eye" cx="70" cy="46" r="5.6"/>
        <ellipse class="pupil" cx="50" cy="46" rx="1.7" ry="4.2"/><ellipse class="pupil" cx="70" cy="46" rx="1.7" ry="4.2"/>
      </g>
    </svg>`;

  // 丸くなって寝る
  const SLEEP = `
    <svg class="sprite sprite-sleep" viewBox="0 0 120 70" aria-hidden="true">
      <g class="sleep-body">
        ${rimFill(`<ellipse cx="56" cy="47" rx="36" ry="19"/>
          <path d="M79 34 L81 21 L89 30 Z"/><path d="M92 30 L99 20 L101 35 Z"/>
          <circle cx="89" cy="43" r="14"/>
          <path class="line" d="M24 54 C26 68 70 69 93 58"/>`)}
        <path class="closed-eye" d="M89 44 Q93 47 97 44"/>
      </g>
    </svg>
    <span class="zz" aria-hidden="true">z</span>`;

  // 小物：買い物袋・ごはん皿
  const BAG = `<svg class="prop-bag" viewBox="0 0 60 56" aria-hidden="true">
      <path class="bag" d="M8 14 L52 14 L56 54 L4 54 Z"/>
      <path class="bag-fold" d="M8 14 L52 14 L51 20 L9 20 Z"/>
      <path class="bag-leaf" d="M24 14 C22 4 30 2 31 10 M33 14 C35 6 42 6 40 13"/>
    </svg>`;
  const BOWL = `<svg class="prop-bowl" viewBox="0 0 60 26" aria-hidden="true">
      <ellipse class="kibble" cx="22" cy="9" rx="5" ry="3"/><ellipse class="kibble" cx="31" cy="8" rx="5" ry="3"/><ellipse class="kibble" cx="39" cy="10" rx="4" ry="2.6"/>
      <path class="bowl" d="M5 11 L55 11 L49 25 L11 25 Z"/>
    </svg>`;

  // ---------- 状態 ----------
  let lane, track, cat, prop, bubble;
  let scene = 'wander';
  let x = 40; // いまの位置（px）
  let pose = 'sit';
  let timer = null;
  let bubbleTimer = null;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mount(el) {
    lane = el;
    // 通り道（床）の中に、ハルが動ける範囲（track）を作る。「＋」ボタンの場所は含めない
    lane.innerHTML = `
      <div class="haru-track">
        <div class="haru-prop"></div>
        <button type="button" class="haru" aria-label="ハル">
          <span class="haru-bubble" hidden></span>
          <span class="haru-body">${WALK}${SIT}${SLEEP}</span>
        </button>
      </div>`;
    track = lane.querySelector('.haru-track');
    prop = lane.querySelector('.haru-prop');
    cat = lane.querySelector('.haru');
    bubble = lane.querySelector('.haru-bubble');
    cat.addEventListener('click', () => meow());
    setPose('sit');
    place(Math.min(40, maxX()), false);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
    window.addEventListener('resize', () => place(Math.min(x, maxX()), false));
  }

  /** 場面を変える */
  function setScene(next) {
    if (!lane || next === scene) return;
    scene = next;
    run();
  }

  // ---------- 動き ----------
  function maxX() {
    return Math.max(0, track.clientWidth - SIZE.walk);
  }

  function setPose(p) {
    pose = p;
    cat.dataset.pose = p;
    cat.style.width = SIZE[p] + 'px';
  }

  function place(nx, animate, ms = 0) {
    x = nx;
    cat.style.transition = animate ? `transform ${ms}ms linear` : 'none';
    cat.style.transform = `translateX(${Math.round(x)}px)`;
  }

  // x まで歩く。着いたら done()
  function walkTo(target, done) {
    target = Math.max(0, Math.min(maxX(), target));
    const dist = Math.abs(target - x);
    if (reduced || dist < 8) {
      place(target, false);
      return done();
    }
    cat.dataset.face = target < x ? 'left' : 'right';
    setPose('walk');
    const ms = (dist / SPEED) * 1000;
    place(target, true, ms);
    timer = setTimeout(done, ms);
  }

  function stop() {
    clearTimeout(timer);
  }

  // 場面ごとの過ごし方
  function run() {
    if (!lane) return;
    stop();
    lane.dataset.scene = scene;
    prop.innerHTML = scene === 'bag' ? BAG : scene === 'bowl' ? BOWL : '';
    const spot = Math.min(maxX(), Math.max(60, track.clientWidth * 0.3));
    prop.style.transform = `translateX(${Math.round(spot)}px)`;

    if (scene === 'wander') return wander();
    if (scene === 'bag') return walkTo(spot + 18, () => setPose('sit')); // 袋に半分かくれてのぞく
    if (scene === 'bowl') return walkTo(spot + 58, () => setPose('sit')); // 皿のとなりに座る
    if (scene === 'look') return walkTo(spot, () => setPose('sit'));
    if (scene === 'sleep') return walkTo(spot, () => setPose('sleep'));
  }

  // ふだん：歩く → しばらく座る → 歩く…（ゆっくり、ときどき）
  function wander() {
    const target = Math.random() * maxX();
    walkTo(target, () => {
      setPose('sit');
      timer = setTimeout(wander, 6000 + Math.random() * 9000);
    });
  }

  // さわると鳴く（寝ているときは小さく）
  function meow() {
    bubble.textContent = pose === 'sleep' ? '…' : ['にゃ', 'にゃー', 'んにゃ'][Math.floor(Math.random() * 3)];
    bubble.hidden = false;
    cat.classList.remove('is-hop');
    void cat.offsetWidth;
    if (pose !== 'sleep') cat.classList.add('is-hop');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble.hidden = true), 1500);
  }

  return { mount, setScene };
})();
