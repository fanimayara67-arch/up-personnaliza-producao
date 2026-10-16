import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./production.css";
import "./tailwind.css";
export const metadata: Metadata = {
  title: { default: "Produção UP", template: "%s • Produção UP" },
  robots: { index: false, follow: false },
};
export default function ProductionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
