"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const PING_INTERVAL_MS = 60_000;
const IDLE_PAUSE_MS = 10 * 60_000;

/**
 * Heartbeat de presencia en vivo: solo activo cuando user.status === 'ACTIVE'.
 * Envía pulsos cada ~60s mientras la pestaña está visible y hubo actividad en los últimos 10 min.
 */
export function PresenceTracker({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const sendPing = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastActivityRef.current >= IDLE_PAUSE_MS) return;
      if (now - lastPingRef.current < PING_INTERVAL_MS - 5_000) return;

      lastPingRef.current = now;
      try {
        const res = await fetch("/api/presence/ping", { method: "POST" });
        if (res.status === 401) router.replace("/login");
      } catch {
        // Red temporalmente caída; reintentará en el siguiente intervalo.
      }
    };

    const markActive = () => {
      const wasIdle = Date.now() - lastActivityRef.current >= IDLE_PAUSE_MS;
      lastActivityRef.current = Date.now();
      if (wasIdle) void sendPing();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastActivityRef.current = Date.now();
        void sendPing();
      }
    };

    void sendPing();
    const timer = setInterval(() => void sendPing(), PING_INTERVAL_MS);

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      for (const ev of events) window.removeEventListener(ev, markActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, router]);

  return null;
}
