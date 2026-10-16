import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { PublicCatalog } from "./StoreHeader";
export const readPublicCatalog = cache(async (): Promise<PublicCatalog> => {
  const text = await fs.readFile(
    path.join(process.cwd(), "public/storefront-catalog.js"),
    "utf8",
  );
  return JSON.parse(
    text
      .slice(text.indexOf("=") + 1)
      .trim()
      .replace(/;$/, ""),
  ) as PublicCatalog;
});
export const readStorePage = cache(async (slug: string) => {
  if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(slug)) notFound();
  const file = path.join(process.cwd(), "public", slug + ".html");
  let html: string;
  try {
    html = await fs.readFile(file, "utf8");
  } catch {
    notFound();
  }
  const title =
      html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "UP Personnaliza",
    description = html.match(
      /<meta name="description" content="([^"]*)"/i,
    )?.[1];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "",
    bodyClass = html.match(/<body[^>]*class="([^"]*)"/i)?.[1] || "store-page";
  const styles = [
    ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1]);
  const scripts = [
    ...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g),
  ].map((m) => m[1]);
  return { slug, title, description, body, bodyClass, styles, scripts };
});
