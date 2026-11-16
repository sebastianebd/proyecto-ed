import { z } from "zod";
import { validatePushEndpointUrl } from "@/lib/push-validation";

export const pushEndpointSchema = z
  .string({ error: "Endpoint Push requerido" })
  .trim()
  .min(16, "Endpoint Push demasiado corto")
  .max(2000, "Endpoint Push demasiado largo")
  .refine((val) => validatePushEndpointUrl(val).ok, "Endpoint Push no permitido o inseguro");

export const pushSubscribeSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string({ error: "Clave p256dh requerida" }).trim().min(20).max(512),
    auth: z.string({ error: "Clave auth requerida" }).trim().min(8).max(256),
  }),
  platform: z.enum(["android", "ios", "desktop"]).default("desktop"),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string({ error: "Endpoint Push requerido" }).trim().min(16).max(2000),
});
