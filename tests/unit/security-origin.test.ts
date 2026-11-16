import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "@/lib/http";
import { checkOrigin, homePathForRole, isAllowedOrigin, sessionCookieName, sessionCookieOptions } from "@/lib/security";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Casos Origin/Referer de docs/05-pruebas-y-qa.md §2.4 (parte Hito 1).
describe("Hito 1 — Origin / Referer y cookie segura", () => {
  const APP = "https://ed.5acym.cl";

  it.each([
    { label: "mismo Origin exacto", headers: { origin: "https://ed.5acym.cl" }, ok: true },
    { label: "Referer válido sin Origin", headers: { referer: "https://ed.5acym.cl/login" }, ok: true },
    { label: "Origin ausente y sin Referer", headers: {}, ok: false },
    { label: "Origin null", headers: { origin: "null" }, ok: false },
    { label: "Origin atacante", headers: { origin: "https://evil-5acym.cl" }, ok: false },
    { label: "Origin esquema HTTP distinto", headers: { origin: "http://ed.5acym.cl" }, ok: false },
  ])("$label -> $ok", ({ headers, ok }) => {
    const h = new Headers(headers as Record<string, string>);
    expect(isAllowedOrigin(h, APP)).toBe(ok);
  });

  it("exime únicamente a /api/cron/daily en checkOrigin", () => {
    vi.stubEnv("APP_URL", APP);
    const cronReq = new NextRequest(`${APP}/api/cron/daily`, { method: "POST" });
    expect(checkOrigin(cronReq)).toBeNull();

    const logoutNoOrigin = new NextRequest(`${APP}/api/auth/logout`, { method: "POST" });
    expect(checkOrigin(logoutNoOrigin)?.status).toBe(403);
  });

  it("usa __Host-ed_session + Secure en HTTPS y ed_session en localhost HTTP", () => {
    vi.stubEnv("APP_URL", "https://ed.5acym.cl");
    expect(sessionCookieName()).toBe("__Host-ed_session");
    expect(sessionCookieOptions().secure).toBe(true);

    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(sessionCookieName()).toBe("ed_session");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("resuelve la ruta inicial correcta según rol", () => {
    expect(homePathForRole("SUPER_ADMIN")).toBe("/admin");
    expect(homePathForRole("TEACHER")).toBe("/profesor/asistencia");
    expect(homePathForRole("PARENT")).toBe("/");
  });

  it("getClientIp prioriza x-vercel-forwarded-for y x-real-ip antes que x-forwarded-for", () => {
    const rVercel = new NextRequest("https://ed.5acym.cl", {
      headers: {
        "x-vercel-forwarded-for": "198.51.100.1, 10.0.0.1",
        "x-real-ip": "203.0.113.2",
        "x-forwarded-for": "1.2.3.4",
      },
    });
    expect(getClientIp(rVercel)).toBe("198.51.100.1");

    const rReal = new NextRequest("https://ed.5acym.cl", {
      headers: { "x-real-ip": "203.0.113.2", "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientIp(rReal)).toBe("203.0.113.2");

    const rFallback = new NextRequest("https://ed.5acym.cl", {
      headers: { "x-forwarded-for": "192.0.2.5, 10.0.0.1" },
    });
    expect(getClientIp(rFallback)).toBe("192.0.2.5");
  });
});
