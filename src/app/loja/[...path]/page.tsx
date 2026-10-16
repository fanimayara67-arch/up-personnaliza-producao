import { StorePage } from "@/features/storefront/StorePage";
import { readStorePage } from "@/features/storefront/source";
type Props = { params: Promise<{ path: string[] }> };
export async function generateMetadata({ params }: Props) {
  const page = await readStorePage((await params).path.join("/"));
  return { title: page.title, description: page.description };
}
export default async function PublicPage({ params }: Props) {
  return <StorePage slug={(await params).path.join("/")} />;
}
