import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { productionConfig } from "../../production/config.js";
import { ProductionRepository } from "../../production/repository.js";
import { ProductionAuth } from "../../production/auth.js";
export const config = productionConfig(process.cwd());
export const productionAuth = new ProductionAuth(
  config,
  new ProductionRepository(config),
);
export async function requireOperator() {
  try {
    const h = await headers();
    return await productionAuth.operator({ headers: Object.fromEntries(h) });
  } catch {
    redirect("/producao/login");
  }
}
