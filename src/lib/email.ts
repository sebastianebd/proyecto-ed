import { Resend } from "resend";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Envía el OTP por correo (Resend). Sin datos de menores. Sin RESEND_API_KEY:
 * en desarrollo local imprime el código en consola; en producción solo registra el error.
 */
export async function sendOtpEmail(params: { to: string; name: string; code: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY no configurada: no se envió el OTP");
      return;
    }
    console.log(`[DEV OTP] Código para ${params.to}: ${params.code} (válido 10 minutos)`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Escuela Dominical 5ta ACyM <iglesia@5acym.cl>",
    to: params.to,
    subject: "Tu código de ingreso",
    text: `Hola ${params.name}, tu código de ingreso es ${params.code}. Vence en 10 minutos. Si no lo solicitaste, ignora este correo.`,
    html: `<p>Hola ${escapeHtml(params.name)},</p><p>Tu código de ingreso es <strong style="font-size:22px;letter-spacing:4px">${params.code}</strong></p><p>Vence en 10 minutos. Si no lo solicitaste, ignora este correo.</p>`,
  });
  if (error) console.error("[email] Resend rechazó el envío:", error.name, error.message);
}
