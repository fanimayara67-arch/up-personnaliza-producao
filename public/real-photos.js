/* Referência sem dependências para o carrossel. Carregar após real-media.js. */
(() => {
  const root = document.querySelector('[data-real-hero]');
  const slides = window.UP_HERO_MEDIA || window.UP_REAL_MEDIA?.hero;
  if (!root || !slides?.length || root.dataset.enhanced) return;
  root.dataset.enhanced = 'true';
  const track = root.querySelector('.real-hero__track');
  const dots = [...root.querySelectorAll('.real-hero__dot')];
  const pauseButton = root.querySelector('.real-hero__pause');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let position = 1;
  let current = 0;
  let busy = false;
  let manualPaused = false;
  let hoverPaused = false;
  let focusPaused = false;
  let inView = true;
  let timer;
  let movementTimer;

  const updateA11y = () => {
    dots.forEach((dot, index) => dot.setAttribute('aria-pressed', String(index === current)));
    [...track.children].forEach((slide, index) => {
      const hidden = slide.dataset.clone === 'true' || index !== current + 1;
      slide.setAttribute('aria-hidden', String(hidden));
    });
    root.dataset.active = String(current);
  };
  const preloadNext = () => {
    const next = slides[(current + 1) % slides.length];
    const media = window.matchMedia('(max-width:700px)').matches ? next.mobile : next.desktop;
    const image = new Image();
    image.decoding = 'async';
    image.sizes = '100vw';
    image.srcset = media.srcset;
    image.src = media.src;
  };
  const normalize = () => {
    clearTimeout(movementTimer);
    if (position === 0 || position === slides.length + 1) {
      position = position === 0 ? slides.length : 1;
      track.dataset.noTransition = 'true';
      track.style.transform = `translateX(${-100 * position}%)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { delete track.dataset.noTransition; }));
    }
    busy = false;
    updateA11y();
  };
  const goTo = target => {
    if (busy) return;
    const next = (target + slides.length) % slides.length;
    if (next === current) return;
    const forward = current === slides.length - 1 && next === 0;
    const backward = current === 0 && next === slides.length - 1;
    position = forward ? slides.length + 1 : backward ? 0 : next + 1;
    current = next;
    busy = !motion.matches;
    track.style.transform = `translateX(${-100 * position}%)`;
    updateA11y();
    preloadNext();
    if (motion.matches) normalize();
    else movementTimer = setTimeout(normalize, 820);
  };
  const resetTimer = () => {
    clearInterval(timer);
    if (!manualPaused && !hoverPaused && !focusPaused && inView && !document.hidden && !motion.matches) {
      timer = setInterval(() => goTo(current + 1), 5500);
    }
  };
  track.addEventListener('transitionend', event => {
    if (event.target === track && event.propertyName === 'transform') normalize();
  });
  dots.forEach((dot, index) => dot.addEventListener('click', () => { goTo(index); resetTimer(); }));
  pauseButton?.addEventListener('click', () => {
    manualPaused = !manualPaused;
    pauseButton.setAttribute('aria-pressed', String(manualPaused));
    pauseButton.setAttribute('aria-label', manualPaused ? 'Retomar apresentação das imagens' : 'Pausar apresentação das imagens');
    pauseButton.querySelector('path')?.setAttribute('d', manualPaused ? 'M3 1.5 10.5 6 3 10.5Z' : 'M2 1h3v10H2zM7 1h3v10H7z');
    resetTimer();
  });
  root.addEventListener('mouseenter', () => { hoverPaused = true; resetTimer(); });
  root.addEventListener('mouseleave', () => { hoverPaused = false; resetTimer(); });
  root.addEventListener('focusin', () => { focusPaused = true; resetTimer(); });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) { focusPaused = false; resetTimer(); }
  });
  root.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
    resetTimer();
  });
  let swipeStart;
  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || event.target.closest('button')) return;
    swipeStart = { x:event.clientX, y:event.clientY };
  }, { passive:true });
  root.addEventListener('pointerup', event => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy)) return;
    goTo(current + (dx < 0 ? 1 : -1));
    resetTimer();
  }, { passive:true });
  root.addEventListener('pointercancel', () => { swipeStart = null; });
  motion.addEventListener('change', () => { if (motion.matches) normalize(); resetTimer(); });
  document.addEventListener('visibilitychange', resetTimer);
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    resetTimer();
  }, { threshold: .08 }).observe(root);
  updateA11y();
  preloadNext();
  resetTimer();
})();
