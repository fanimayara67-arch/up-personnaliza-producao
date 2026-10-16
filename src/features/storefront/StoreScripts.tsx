"use client";
import { useEffect } from "react";
export function StoreScripts({
  scripts,
  bodyClass,
}: {
  scripts: string[];
  bodyClass: string;
}) {
  useEffect(() => {
    document.body.className = bodyClass;
    if (document.body.dataset.upScripts === location.pathname) return;
    document.body.dataset.upScripts = location.pathname;
    // Existing business flows retain their scripts until their React replacement is verified.
    async function load() {
      for (const src of scripts) {
        await new Promise<void>((resolve, reject) => {
          const element = document.createElement("script");
          element.src = src;
          element.async = false;
          element.onload = () => resolve();
          element.onerror = () =>
            reject(new Error("Falha ao carregar recurso da loja."));
          document.body.append(element);
        });
      }
      const data = (
        window as unknown as {
          UP_COMMERCE?: {
            products: { id: string; familyId?: string }[];
            categories: { id: string; slug: string }[];
          };
        }
      ).UP_COMMERCE;
      const url = new URL(location.href);
      if (
        data &&
        url.pathname === "/personalizados.html" &&
        url.searchParams.has("produto")
      ) {
        const model = data.products.find(
            (p) =>
              p.id === url.searchParams.get("modelo") &&
              p.familyId === url.searchParams.get("produto"),
          ),
          category = data.categories.find(
            (c) => c.id === url.searchParams.get("produto"),
          );
        if (model) location.replace("/produtos/" + model.id + ".html");
        else if (category)
          location.replace("/categorias/" + category.slug + ".html");
      }
      if (data && url.pathname === "/" && url.hash) {
        const values = new URLSearchParams(url.hash.slice(1)),
          product = data.products.find((p) => p.id === values.get("produto")),
          category = data.categories.find((c) =>
            [c.id, c.slug].includes(values.get("categoria") || ""),
          );
        if (product) {
          const query = new URLSearchParams();
          for (const key of ["line", "variante"])
            if (values.has(key)) query.set(key, values.get(key)!);
          location.replace(
            "/produtos/" +
              product.id +
              ".html" +
              (query.size ? "?" + query : ""),
          );
        } else if (category)
          location.replace("/categorias/" + category.slug + ".html");
      }
      window.dispatchEvent(new Event("up-store-ready"));
    }
    void load().catch(() => {
      window.dispatchEvent(new CustomEvent("up-store-load-error"));
    });
  }, [scripts, bodyClass]);
  return null;
}
