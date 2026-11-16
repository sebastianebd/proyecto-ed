// Validación estricta anti-SSRF para endpoints Web Push (docs/03-seguridad.md §6.4).

const ALLOWED_EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
  "updates.push.services.mozilla.com",
]);

const ALLOWED_HOST_SUFFIXES = [
  ".notify.windows.com",
  ".push.apple.com",
  ".push.samsungosp.com",
];

function isIpLiteralOrLocal(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.includes(":")) return true; // IPv6 en brackets o literal
  return false;
}

export function validatePushEndpointUrl(
  rawEndpoint: string,
): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(rawEndpoint);
  } catch {
    return { ok: false, error: "URL de suscripción Push inválida" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "El endpoint Push debe usar HTTPS" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "El endpoint Push no puede contener credenciales" };
  }
  if (url.port !== "" && url.port !== "443") {
    return { ok: false, error: "Puerto no permitido en endpoint Push" };
  }

  const host = url.hostname.toLowerCase();
  if (!host || isIpLiteralOrLocal(host)) {
    return { ok: false, error: "Host local o IP privada no permitido en endpoint Push" };
  }

  const allowed =
    ALLOWED_EXACT_HOSTS.has(host) || ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));

  if (!allowed) {
    return { ok: false, error: "Proveedor de notificaciones Push no permitido" };
  }

  return { ok: true, url };
}
