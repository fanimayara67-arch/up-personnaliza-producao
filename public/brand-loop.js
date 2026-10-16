(() => {
  const section = document.querySelector('.brand-loop');
  if (!section) return;

  const viewport = section.querySelector('.brand-loop__viewport');
  const track = section.querySelector('.brand-loop__track');
  const group = section.querySelector('.brand-loop__group');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const updateLayout = () => {
    if (reducedMotion.matches) {
      while (track.children.length > 1) track.lastElementChild.remove();
      return;
    }
    viewport.scrollLeft = 0;
    if (!reducedMotion.matches) {
      const distance = group.getBoundingClientRect().width;
      if (distance <= 0) return;
      // Enough copies to cover even ultrawide screens at the end of a cycle.
      const requiredCopies = Math.ceil(viewport.getBoundingClientRect().width / distance);
      while (track.children.length - 1 < requiredCopies) {
        const duplicate = group.cloneNode(true);
        duplicate.removeAttribute('aria-label');
        duplicate.setAttribute('aria-hidden', 'true');
        duplicate.setAttribute('inert', '');
        duplicate.querySelectorAll('img').forEach(image => { image.alt = ''; });
        track.appendChild(duplicate);
      }
      while (track.children.length - 1 > requiredCopies) track.lastElementChild.remove();
      section.style.setProperty('--brand-distance', `${distance}px`);
      section.style.setProperty('--brand-duration', `${distance / 36}s`);
    }
  };

  updateLayout();
  // Fixed logo cells keep geometry stable while the images decode.
  section.dataset.ready = 'true';

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      section.dataset.offscreen = String(!entry.isIntersecting);
    }).observe(section);
  }
  document.addEventListener('visibilitychange', () => {
    section.dataset.background = String(document.hidden);
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(updateLayout).observe(viewport);
  } else {
    window.addEventListener('resize', updateLayout, { passive: true });
  }
  reducedMotion.addEventListener('change', updateLayout);
})();
