import { requireOperator } from "@/lib/production-server";
import ProductionPanel from "@/features/production/ProductionPanel";
export const dynamic = "force-dynamic";
export default async function NestingPage() {
  const operator = await requireOperator();
  return <ProductionPanel operator={operator} />;
}
