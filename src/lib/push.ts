import { sendNotification, setVapidDetails } from "web-push";

export type PushSubscriptionTarget = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
};

/** Mensaje neutro obligatorio en pantalla bloqueada sin nombres de menores (docs/03-seguridad.md §6.4). */
export const PUSH_NEW_LESSON_PAYLOAD: PushNotificationPayload = {
  title: "Escuela Dominical 5ta ACyM",
  body: "Escuela Dominical: Nueva lección disponible para repasar en casa",
  url: "/",
};

export type PushDeliveryOutcome = "sent" | "gone" | "failed";

export type PushSenderFn = (
  sub: PushSubscriptionTarget,
  payload: PushNotificationPayload,
) => Promise<PushDeliveryOutcome>;

export function getVapidPublicKey(): string | null {
  const key = (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  return key.length > 0 ? key : null;
}

function getVapidConfig() {
  const publicKey = getVapidPublicKey();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:iglesia@5acym.cl").trim();
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  const { publicKey, privateKey } = getVapidConfig();
  return Boolean(publicKey && privateKey);
}

/** Envía una notificación Web Push vía VAPID; retorna `gone` ante HTTP 404/410 para limpiar suscripción. */
export async function sendWebPushNotification(
  sub: PushSubscriptionTarget,
  payload: PushNotificationPayload = PUSH_NEW_LESSON_PAYLOAD,
): Promise<PushDeliveryOutcome> {
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) {
    return "failed";
  }

  try {
    setVapidDetails(subject, publicKey, privateKey);
    await sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 86_400 },
    );
    return "sent";
  } catch (err) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err ? Number((err as { statusCode?: unknown }).statusCode) : 0;
    if (statusCode === 410 || statusCode === 404) {
      return "gone";
    }
    console.error("[push] error al enviar notificación:", err instanceof Error ? err.message : err);
    return "failed";
  }
}
