import { describe, expect, it } from "vitest";
import { formatRutForInput, normalizeRut } from "@/lib/rut";

// Casos exactos de docs/05-pruebas-y-qa.md §2.1.
describe("Hito 1 — RUT chileno (@fdograph/rut-utilities)", () => {
  it.each([
    { label: "RUT real < 1.000.000 (7 chars limpios)", input: "987.654-5", expected: "987654-5" },
    { label: "RUT estándar 9 chars + k minúscula", input: "12.345.670-k", expected: "12345670-K" },
    { label: "RUT con espacios al pegar", input: "  12.345.678-5  ", expected: "12345678-5" },
    { label: "RUT sin puntos ni guion", input: "18963546k", expected: "18963546-K" },
  ])("acepta y normaliza a DASH mayúsculas: $label", ({ input, expected }) => {
    expect(normalizeRut(input)).toBe(expected);
  });

  it.each([
    { label: "menor al mínimo (6 chars limpios, Mod 11 válido)", input: "12.345-5" },
    { label: "excede máximo (10 chars limpios, Mod 11 válido)", input: "123.456.789-2" },
    { label: "patrón sospechoso 11.111.111-1", input: "11.111.111-1" },
    { label: "patrón sospechoso 22.222.222-2", input: "22.222.222-2" },
    { label: "dígito verificador incorrecto", input: "12.345.670-1" },
    { label: "cadena vacía / no numérica", input: "abc" },
    { label: "cadena demasiado larga con basura", input: "   12345678901234567890   " },
  ])("rechaza entrada inválida: $label", ({ input }) => {
    expect(normalizeRut(input)).toBeNull();
  });

  it("limpia espacios al pegar antes de recortar, conserva el -5 y formatea visualmente", () => {
    expect(formatRutForInput("  12.345.678-5  ")).toBe("12.345.678-5");
    expect(formatRutForInput(" 987.654-k ")).toBe("987.654-K");
  });
});
