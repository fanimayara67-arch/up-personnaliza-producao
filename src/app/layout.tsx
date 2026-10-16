import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
export const metadata: Metadata = {
  title: "UP Personnaliza",
  icons: { icon: "/assets/branding/up-symbol.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#67ad34",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
