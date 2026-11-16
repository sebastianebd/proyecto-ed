import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validatePushEndpointUrl } from "@/lib/push-validation";

describe("Hito 6 — Validación anti-SSRF de endpoints Push", () => {
  it("acepta proveedores oficiales Web Push por HTTPS", () => {
    expect(validatePushEndpointUrl("https://fcm.googleapis.com/fcm/send/abc123token").ok).toBe(true);
    expect(validatePushEndpointUrl("https://web.push.apple.com/QHS6xyz").ok).toBe(true);
    expect(validatePushEndpointUrl("https://updates.push.services.mozilla.com/wpush/v2/xyz").ok).toBe(true);
    expect(validatePushEndpointUrl("https://wns2-bl2p.notify.windows.com/w/?token=123").ok).toBe(true);
  });

  it("rechaza HTTP, IPs privadas, localhost, credenciales, puertos y subdominios engañosos", () => {
    const invalid = [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost:3000/api/admin/users",
      "https://user:pass@fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://fcm.googleapis.com.evil.com/fcm/send/abc",
      "https://evilnotify.windows.com/w/",
      "https://attacker.cl/webhook",
    ];
    for (const endpoint of invalid) {
      expect(validatePushEndpointUrl(endpoint).ok, `debió rechazar: ${endpoint}`).toBe(false);
    }
  });
});

describe("Hito 6 — Seguridad de Service Worker y Manifiesto PWA", () => {
  it("sw.js mantiene allowlist estricto sin /api/* ni ?_rsc= y sin cachear HTML privado", () => {
    const sw = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain('url.searchParams.has("_rsc")');
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
    expect(sw).toContain('url.pathname === "/offline.html"');
    expect(sw).not.toContain("cache.put(req, res)"); // Solo cachea en isAllowedStaticAsset (nunca en navigate)
  });

  it("manifest.webmanifest y los íconos PNG obligatorios existen", () => {
    const manifestRaw = fs.readFileSync(path.join(process.cwd(), "public", "manifest.webmanifest"), "utf8");
    const manifest = JSON.parse(manifestRaw) as { theme_color: string; display: string; icons: { src: string }[] };
    expect(manifest.theme_color).toBe("#EA580C");
    expect(manifest.display).toBe("standalone");
    expect(fs.existsSync(path.join(process.cwd(), "public", "icons", "icon-192.png"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "public", "icons", "icon-512.png"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "public", "icons", "apple-touch-icon.png"))).toBe(true);
  });
});
