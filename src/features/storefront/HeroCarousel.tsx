"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
function subscribeMotion(callback: () => void) {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function motionSnapshot() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function HeroCarousel({
  slides,
  label,
}: {
  slides: { label: string; content: ReactNode }[];
  label: string;
}) {
  const [position, setPosition] = useState(1),
    [animated, setAnimated] = useState(true),
    [manualPaused, setManualPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [visible, setVisible] = useState(true),
    [inView, setInView] = useState(true);
  const root = useRef<HTMLElement>(null),
    swipe = useRef<{ x: number; y: number } | null>(null),
    busy = useRef(false);
  const reduced = useSyncExternalStore(
      subscribeMotion,
      motionSnapshot,
      () => false,
    ),
    count = slides.length,
    current = (position - 1 + count) % count;
  const normalize = useCallback(() => {
    if (position === 0 || position === count + 1) {
      setAnimated(false);
      setPosition(position === 0 ? count : 1);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true)),
      );
    }
    busy.current = false;
  }, [count, position]);
  const goTo = useCallback(
    (target: number) => {
      if (busy.current) return;
      const next = (target + count) % count;
      if (next === current) return;
      busy.current = !reduced;
      setPosition(
        current === count - 1 && next === 0
          ? count + 1
          : current === 0 && next === count - 1
            ? 0
            : next + 1,
      );
    },
    [count, current, reduced],
  );
  useEffect(() => {
    if (!manualPaused && !hover && !focus && visible && inView && !reduced) {
      const timer = setInterval(() => goTo(current + 1), 5500);
      return () => clearInterval(timer);
    }
  }, [manualPaused, hover, focus, visible, inView, reduced, current, goTo]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0].isIntersecting),
      { threshold: 0.08 },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", change);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(normalize, reduced ? 0 : 820);
    return () => clearTimeout(timer);
  }, [position, count, reduced, normalize]);
  const collection = [slides[count - 1], ...slides, slides[0]];
  return (
    <section
      ref={root}
      className="hero-banner real-hero"
      data-react-hero="true"
      data-active={current}
      role="region"
      aria-roledescription="carrossel"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          goTo(current + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
      onPointerDown={(event) => {
        if (
          event.pointerType === "touch" &&
          !(event.target as HTMLElement).closest("button")
        )
          swipe.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        swipe.current = null;
        if (start) {
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy))
            goTo(current + (dx < 0 ? 1 : -1));
        }
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      <div
        className="real-hero__track"
        aria-live="off"
        data-no-transition={!animated ? "true" : undefined}
        style={{ transform: `translateX(${-100 * position}%)` }}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === "transform"
          )
            normalize();
        }}
      >
        {collection.map((slide, index) => (
          <div
            key={index}
            className="real-hero__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={slide.label}
            aria-hidden={
              index === 0 || index === count + 1 || index !== current + 1
            }
            data-clone={String(index === 0 || index === count + 1)}
            inert={index === 0 || index === count + 1 ? true : undefined}
          >
            {slide.content}
          </div>
        ))}
      </div>
      <div className="real-hero__controls">
        {slides.map((slide, index) => (
          <button
            key={index}
            className="real-hero__dot"
            type="button"
            aria-label={
              "Mostrar " +
              slide.label.replace(/^\d+ de \d+: /, "").toLowerCase()
            }
            aria-pressed={current === index}
            onClick={() => goTo(index)}
          />
        ))}
        <button
          className="real-hero__pause"
          type="button"
          aria-label={
            manualPaused
              ? "Retomar apresentação das imagens"
              : "Pausar apresentação das imagens"
          }
          aria-pressed={manualPaused}
          onClick={() => setManualPaused(!manualPaused)}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d={
                manualPaused
                  ? "M3 1.5 10.5 6 3 10.5Z"
                  : "M2 1h3v10H2zM7 1h3v10H7z"
              }
            />
          </svg>
        </button>
      </div>
    </section>
  );
}
