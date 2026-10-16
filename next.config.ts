import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": [
      "./public/**/*.html",
      "./public/storefront-catalog.js",
      "./catalog/*.json",
      "./commerce.json",
      "./admin/**/*",
    ],
  },
  turbopack: { root: process.cwd() },
  serverExternalPackages: [],
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:path*.html", destination: "/loja/:path*" },
        { source: "/index.html", destination: "/" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/producao/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
