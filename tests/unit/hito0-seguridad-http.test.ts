import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { config as proxyConfig, proxy } from "@/proxy";

function run(url = "http://localhost:3000/") {
  return proxy(new NextRequest(url));
}

describe("Hito 0 — CSP con nonce (proxy.ts)", () => {
  it("emite CSP con nonce por petición, strict-dynamic y sin unsafe-inline en script-src", () => {
    const csp = run().headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("genera un nonce distinto en cada petición y lo propaga como x-nonce", () => {
    const a = run();
    const b = run();
    const nonceOf = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get("Content-Security-Policy") ?? "")?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(a));
  });

  it("agrega X-Robots-Tag noindex, nofollow", () => {
    expect(run().headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("el matcher excluye estáticos y mantiene rutas de app/API", () => {
    const re = new RegExp(`^${proxyConfig.matcher[0]}$`);
    for (const p of ["/_next/static/a.js", "/icons/192.png", "/sw.js", "/manifest.webmanifest", "/offline.html", "/robots.txt"]) {
      expect(re.test(p), p).toBe(false);
    }
    for (const p of ["/", "/login", "/api/auth/me", "/admin"]) {
      expect(re.test(p), p).toBe(true);
    }
  });
});

describe("Hito 0 — cabeceras estáticas y robots", () => {
  it("next.config.ts define las cabeceras de seguridad exigidas", async () => {
    const rules = await nextConfig.headers!();
    const map = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(map["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("public/robots.txt bloquea toda indexación", () => {
    const txt = readFileSync(path.resolve("public/robots.txt"), "utf8");
    expect(txt).toMatch(/User-agent:\s*\*/);
    expect(txt).toMatch(/Disallow:\s*\/\s*$/m);
  });

  it("public/offline.html es estático puro (sin scripts)", () => {
    const html = readFileSync(path.resolve("public/offline.html"), "utf8");
    expect(html).not.toMatch(/<script/i);
  });
});
