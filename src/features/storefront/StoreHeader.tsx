"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
export interface PublicCatalog {
  categories: { id: string; slug: string; name: string; department: string }[];
  products: { id: string; title: string; categorySlug: string }[];
}
interface StoreWindow extends Window {
  UP_PROJECT?: { all: () => unknown[] };
  UP_SEARCH?: { find: (query: string) => { title: string; href: string }[] };
}
const store = () => window as StoreWindow;
function subscribeCount(callback: () => void) {
  for (const name of [
    "up-project-change",
    "up-store-ready",
    "storage",
    "pageshow",
  ])
    window.addEventListener(name, callback);
  return () => {
    for (const name of [
      "up-project-change",
      "up-store-ready",
      "storage",
      "pageshow",
    ])
      window.removeEventListener(name, callback);
  };
}
function countSnapshot() {
  try {
    return store().UP_PROJECT?.all().length || 0;
  } catch {
    return 0;
  }
}
const icon = (type: "search" | "chat" | "cart" | "menu" | "arrow") => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {type === "search" ? (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ) : (
      <path
        d={
          {
            chat: "M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0ZM8 10h8M8 14h5",
            cart: "M3 3h2l3 13h11l2-9H6M9 21h.01M18 21h.01",
            menu: "M4 6h16M4 12h16M4 18h16",
            arrow: "M4 12h16m-6-6 6 6-6 6",
          }[type]
        }
      />
    )}
  </svg>
);
const normalized = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function StoreHeader({
  catalog,
  slug,
}: {
  catalog: PublicCatalog;
  slug: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [suggesting, setSuggesting] = useState(false);
  const root = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null),
    button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null),
    suggestions = useRef<HTMLDivElement>(null);
  const count = useSyncExternalStore(subscribeCount, countSnapshot, () => 0);
  useEffect(() => {
    const outside = (event: Event) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
        setSuggesting(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, []);
  const matches = query.trim()
    ? typeof window !== "undefined" && store().UP_SEARCH
      ? store().UP_SEARCH!.find(query).slice(0, 5)
      : catalog.products
          .filter((p) => normalized(p.title).includes(normalized(query)))
          .slice(0, 5)
          .map((p) => ({ title: p.title, href: "/produtos/" + p.id + ".html" }))
    : [];
  const current = "/" + slug + ".html";
  const selected = catalog.products.find(
    (p) => current === "/produtos/" + p.id + ".html",
  );
  const nav = (url: string) => ({
    "aria-current": current === url ? ("page" as const) : undefined,
    className:
      selected && url === "/categorias/" + selected.categorySlug + ".html"
        ? "store-current-section"
        : undefined,
  });
  return (
    <header
      ref={root}
      className="store-header"
      data-react-header="true"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (open) {
            setOpen(false);
            button.current?.focus();
          } else if (suggesting) {
            setSuggesting(false);
            input.current?.focus();
          }
        }
      }}
    >
      <div className="container store-header-main">
        <a className="brand" href="/" aria-label="UP Personaliza, início">
          <span className="brand-symbol" aria-hidden="true">
            <img
              src="/assets/branding/up-symbol.png?v=up1"
              alt=""
              width="512"
              height="190"
            />
          </span>
          <span className="brand-name" aria-hidden="true">
            <img
              src="/assets/branding/up-wordmark.png?v=up1"
              alt=""
              width="768"
              height="120"
            />
          </span>
        </a>
        <form
          action="/buscar.html"
          method="get"
          role="search"
          className="store-search"
        >
          <label htmlFor="storeSearch" className="sr-only">
            Buscar produtos
          </label>
          <input
            ref={input}
            id="storeSearch"
            name="q"
            type="search"
            placeholder="O que você está procurando?"
            maxLength={100}
            autoComplete="off"
            aria-controls="storeSuggestions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggesting(true);
              setOpen(false);
            }}
            onFocus={() => setSuggesting(true)}
            onKeyDown={(event) => {
              if (
                ["ArrowDown", "ArrowUp"].includes(event.key) &&
                query.trim()
              ) {
                event.preventDefault();
                setSuggesting(true);
                const links = suggestions.current?.querySelectorAll("a");
                (event.key === "ArrowDown"
                  ? links?.[0]
                  : links?.[links.length - 1]
                )?.focus();
              }
            }}
          />
          <button type="submit" aria-label="Buscar produtos">
            {icon("search")}
          </button>
          <div
            ref={suggestions}
            id="storeSuggestions"
            className="store-suggestions"
            role="group"
            aria-label="Sugestões de produtos"
            hidden={!suggesting || !query.trim()}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
              event.preventDefault();
              const links = Array.from(
                  suggestions.current?.querySelectorAll("a") || [],
                ),
                index = links.indexOf(
                  document.activeElement as HTMLAnchorElement,
                ),
                next = index + (event.key === "ArrowDown" ? 1 : -1);
              if (next < 0 || next >= links.length) input.current?.focus();
              else links[next].focus();
            }}
          >
            {matches.map((match) => (
              <a key={match.href} href={match.href}>
                {match.title}
              </a>
            ))}
            <a href={"/buscar.html?q=" + encodeURIComponent(query.trim())}>
              {matches.length
                ? "Ver todos os resultados"
                : "Buscar no catálogo completo"}
            </a>
          </div>
        </form>
        <a
          href="/ajuda.html#atendimento"
          className="store-header-action store-help"
        >
          {icon("chat")}
          <span>
            Precisa de ajuda?<strong>Atendimento</strong>
          </span>
        </a>
        <a href="/carrinho.html" className="store-header-action store-cart">
          {icon("cart")}
          <span>
            Meu orçamento
            <strong>
              <span data-project-count>{count}</span> itens
            </strong>
          </span>
        </a>
      </div>
      <div className="store-nav-bar">
        <div className="container store-nav-inner">
          <button
            ref={button}
            type="button"
            id="storeMenuToggle"
            className="store-category-toggle"
            aria-expanded={open}
            aria-controls="storeCategoryMenu"
            onClick={() => {
              setOpen(!open);
              setSuggesting(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                requestAnimationFrame(() =>
                  menu.current?.querySelector("a")?.focus(),
                );
              }
            }}
          >
            {icon("menu")} Todas as categorias <span aria-hidden="true">⌄</span>
          </button>
          <nav className="store-quick-nav" aria-label="Navegação principal">
            {[
              ["/categorias/fachadas-letreiros.html", "Fachadas e letreiros"],
              ["/categorias/adesivos.html", "Adesivos"],
              ["/categorias/impressos.html", "Impressos"],
              ["/categorias/sinalizacao.html", "Sinalização"],
              ["/personalizados.html", "Personalizados"],
            ].map(([url, label]) => (
              <a key={url} href={url} {...nav(url)}>
                {label}
              </a>
            ))}
          </nav>
          <div
            ref={menu}
            id="storeCategoryMenu"
            className="store-category-menu"
            hidden={!open}
          >
            <nav aria-label="Todas as categorias">
              {(["service", "custom"] as const).map((type) => (
                <div key={type}>
                  <a
                    className="store-menu-heading"
                    href={
                      type === "service"
                        ? "/comunicacao-visual.html"
                        : "/personalizados.html"
                    }
                  >
                    {type === "service"
                      ? "Comunicação visual"
                      : "Presentes e personalizados"}
                  </a>
                  {catalog.categories
                    .filter((c) => c.department === type)
                    .map((category) => (
                      <a
                        key={category.id}
                        href={"/categorias/" + category.slug + ".html"}
                        {...nav("/categorias/" + category.slug + ".html")}
                      >
                        {category.name}
                      </a>
                    ))}
                </div>
              ))}
            </nav>
            <a href="/catalogo.html" className="store-menu-all">
              Ver todos os produtos {icon("arrow")}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
