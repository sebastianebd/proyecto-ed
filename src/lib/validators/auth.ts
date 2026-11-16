import { z } from "zod";
import { fullNameSchema, phoneSchema, rutSchema } from "./common";

export const otpCodeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string({ error: "Código OTP requerido" }).regex(/^\d{6}$/, "El código debe tener 6 dígitos numéricos"),
);

export const requestOtpSchema = z.object({
  rut: rutSchema,
});

export const verifyOtpSchema = z.object({
  rut: rutSchema,
  code: otpCodeSchema,
});

export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
