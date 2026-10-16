import { StorePage } from "@/features/storefront/StorePage";
import { readStorePage } from "@/features/storefront/source";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  if (process.env.PRODUCTION_ONLY === "true")
    return {
      title: "Produção UP | UP Personnaliza",
      robots: { index: false, follow: false },
    };
  const page = await readStorePage("index");
  return { title: page.title, description: page.description };
}
export default function Home() {
  if (process.env.PRODUCTION_ONLY === "true") redirect("/producao/encaixe");
  return <StorePage slug="index" />;
}
