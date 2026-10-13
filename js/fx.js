/* =========================================================
   fx.js ― 記録したときのごほうび（コインと肉球の紙吹雪・チャリン音）
   ---------------------------------------------------------
   ・動きを減らす設定の端末では、紙吹雪は出しません。
   ・音は「お金」画面の設定で切れます。
   ========================================================= */

const Fx = (() => {
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ac = null;

  /** at: { x, y }（画面上の位置）。n: 粒の数 */
  function burst(at, n = 14) {
    if (reduced || !document.body.animate) return;
    const x = at ? at.x : innerWidth / 2;
    const y = at ? at.y : innerHeight * 0.6;
    const box = document.createElement('div');
    box.className = 'fx';
    box.setAttribute('aria-hidden', 'true');
    document.body.appendChild(box);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      if (i % 3 === 2) p.className = 'paw';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      box.appendChild(p);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const d = 50 + Math.random() * 100;
      const dx = Math.cos(a) * d;
      const dy = Math.sin(a) * d;
      p.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.95)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 70}px)) scale(0.6)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 350, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
    setTimeout(() => box.remove(), 1400);
  }

  /** チャリン（big なら一音多い） */
  function chime(big) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const notes = big ? [1318.5, 1760, 2093] : [1318.5, 1760];
      notes.forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = ac.currentTime + i * 0.07;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + 0.42);
      });
    } catch (e) {
      /* 音が出せなくても記録は続ける */
    }
  }

  return { burst, chime };
})();
