import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, requestOtp } from "@/lib/auth";
import { getClientIp, parseBody, withErrorHandling } from "@/lib/http";
import { requestOtpSchema } from "@/lib/validators";

const NEUTRAL_RESPONSE = {
  ok: true,
  message: "Si tu RUT está registrado, enviaremos un código de verificación a tu correo.",
};

export const POST = withErrorHandling(async (req: NextRequest) => {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const parsed = await parseBody(req, requestOtpSchema);
  if (!parsed.ok) return parsed.response;

  await requestOtp(parsed.data.rut, getClientIp(req));
  return NextResponse.json(NEUTRAL_RESPONSE);
});
