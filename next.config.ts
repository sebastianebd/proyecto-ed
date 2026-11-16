import type { NextConfig } from "next";

// Cabeceras estáticas (docs/03-seguridad.md §6.1). La CSP con nonce vive en src/proxy.ts.
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["unpdf"],
  async headers() {
    // HSTS solo en producción para no forzar HTTPS al probar la PWA en red local por HTTP.
    const headers =
      process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, ...baseSecurityHeaders]
        : baseSecurityHeaders;
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
