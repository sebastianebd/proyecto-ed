export type PushEnvironment = "supported" | "ios-not-standalone" | "unsupported";

export function detectPushEnvironment(): PushEnvironment {
  if (typeof window === "undefined") return "unsupported";
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as { standalone?: boolean }).standalone);
  const hasPush = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;

  if (isIos && !isStandalone) return "ios-not-standalone";
  return hasPush ? "supported" : "unsupported";
}

export function detectPushPlatform(): "android" | "ios" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  if (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function getActiveBrowserPushEndpoint(): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

export async function enableBrowserPush(): Promise<
  { ok: true; permission: NotificationPermission } | { ok: false; permission: NotificationPermission; message: string }
> {
  if (detectPushEnvironment() !== "supported") {
    return { ok: false, permission: "default", message: "Este navegador no soporta Push Web ahora." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      message:
        permission === "denied"
          ? "El permiso de notificaciones fue bloqueado en este navegador."
          : "No se concedió permiso de notificaciones.",
    };
  }

  const metaRes = await fetch("/api/push/subscribe");
  const meta = (await metaRes.json().catch(() => ({}))) as {
    configured?: boolean;
    publicKey?: string | null;
    error?: string;
  };
  if (!metaRes.ok || !meta.configured || !meta.publicKey) {
    return {
      ok: false,
      permission,
      message: meta.error ?? "Las llaves VAPID de notificaciones aún no están configuradas en el servidor.",
    };
  }

  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js");
  }
  const readyReg = await navigator.serviceWorker.ready;

  let sub = await readyReg.pushManager.getSubscription();
  if (!sub) {
    sub = await readyReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(meta.publicKey),
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  const saveRes = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh, auth },
      platform: detectPushPlatform(),
    }),
  });

  if (!saveRes.ok) {
    const errBody = (await saveRes.json().catch(() => ({}))) as { error?: string };
    return { ok: false, permission, message: errBody.error ?? "No se pudo guardar la suscripción Push." };
  }

  return { ok: true, permission };
}

export async function disableBrowserPush(): Promise<{ ok: boolean; error?: string }> {
  const endpoint = await getActiveBrowserPushEndpoint();
  if (!endpoint) return { ok: true };

  try {
    const res = await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });

    if (!res.ok && res.status !== 404) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? "No se pudo desvincular Push del servidor." };
    }
  } catch {
    return { ok: false, error: "Error de conexión al desvincular notificaciones." };
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) await sub.unsubscribe().catch(() => {});
  } catch {
    // El servidor ya desvinculó la suscripción.
  }

  return { ok: true };
}
