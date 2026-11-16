import { describe, expect, it, vi } from "vitest";
import { generateLessonWithGemini, parseAndValidateGeminiResponse } from "@/lib/gemini";
import { extractAndSplitUnitPdf, hasPdfMagicBytes, splitUnitPdfTextInto14Drafts } from "@/lib/pdf";
import { computeUnlockAtFromSunday, currentMondayStartUtc, currentWeekSundayInSantiago } from "@/lib/timezone";

function buildMinimalPdfBuffer(text: string): Buffer {
  const safe = text.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  const objs = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += o + "\n";
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

// Pruebas de docs/05-pruebas-y-qa.md §2.3 y §2.4 (parte PDF, Gemini y DST).
describe("Hito 3 — Motor PDF (magic bytes, índice vs cuerpo, PDF escaneado)", () => {
  it("valida firma binaria %PDF- y rechaza .exe o HTML renombrado", () => {
    expect(hasPdfMagicBytes(Buffer.from("%PDF-1.7\n1 0 obj\n"))).toBe(true);
    expect(hasPdfMagicBytes(Buffer.from("MZ\x90\x00exe-fake"))).toBe(false);
    expect(hasPdfMagicBytes(Buffer.from("<html><body>fake</body></html>"))).toBe(false);
    expect(hasPdfMagicBytes(Buffer.from("%PD"))).toBe(false);
  });

  it("salta portada e índice inicial con 'Lección 1..14' y divide en los 14 títulos reales", () => {
    const coverAndToc = [
      "ESCUELA DOMINICAL 5TA ACYM - MANUAL DE UNIDAD",
      "ÍNDICE",
      ...Array.from({ length: 14 }, (_, i) => `Lección ${i + 1}: Tema breve ${i + 1} ........ ${5 + i * 6}`),
    ].join("\n");

    const body = Array.from({ length: 14 }, (_, i) => {
      const n = i + 1;
      return `Lección ${n}: Héroe de la Fe Número ${n}\n` +
        `Texto bíblico base y desarrollo pedagógico completo para la clase número ${n}. `.repeat(6);
    }).join("\n\n");

    const result = splitUnitPdfTextInto14Drafts(`${coverAndToc}\n\n${body}`, 90);
    expect(result.scannedWarning).toBe(false);
    expect(result.drafts).toHaveLength(14);
    expect(result.drafts[0].title).toBe("Héroe de la Fe Número 1");
    expect(result.drafts[0].rawText).toContain("desarrollo pedagógico completo para la clase número 1");
    expect(result.drafts[0].rawText).not.toContain("........");
    expect(result.drafts[13].title).toBe("Héroe de la Fe Número 14");
  });

  it("retorna { scannedWarning: true, drafts: 14 } sin excepción en PDF escaneado o vacío", () => {
    for (const emptyText of ["", "   \n\n  \t  \n"]) {
      const res = splitUnitPdfTextInto14Drafts(emptyText, 12);
      expect(res.scannedWarning).toBe(true);
      expect(res.drafts).toHaveLength(14);
      expect(res.drafts.every((d) => d.rawText === "")).toBe(true);
    }
  });

  it("extractAndSplitUnitPdf extrae texto real con unpdf desde un buffer PDF válido", async () => {
    const buf = buildMinimalPdfBuffer(
      "Leccion 1 David y Goliat: historia biblica completa de la quinta iglesia alianza cristiana y misionera.",
    );
    const res = await extractAndSplitUnitPdf(buf);
    expect(res.scannedWarning).toBe(false);
    expect(res.totalPages).toBe(1);
    expect(res.drafts).toHaveLength(14);
    expect(res.drafts[0].rawText).toContain("David y Goliat");
  });
});

describe("Hito 3 — Gemini parser, saneo anti-XSS y backoff HTTP 429", () => {
  const validPayload = {
    title: "David y Goliat",
    biblePassage: "1 Samuel 17:1-50",
    parentSummary: [
      "Esta semana aprendimos que Dios da valentía cuando confiamos en Él.",
      "David recordó la fidelidad de Dios frente a desafíos difíciles.",
    ],
    reinforcementQuestions: [
      "¿En qué situación difícil podemos confiar en Dios esta semana?",
      "¿Cómo demostró David su confianza en el Señor?",
    ],
  };

  it("rechaza salida con <script> o HTML y rechaza JSON malformado", () => {
    const withScript = JSON.stringify({
      ...validPayload,
      parentSummary: [`<script>alert(1)</script>${"a".repeat(55)}`],
    });
    expect(() => parseAndValidateGeminiResponse(withScript)).toThrow(/HTML/i);
    expect(() => parseAndValidateGeminiResponse("{ json roto")).toThrow(/JSON/i);
  });

  it("sanea Markdown crudo accidental (**) y valida Zod antes de persistir", () => {
    const withMd = JSON.stringify({
      ...validPayload,
      parentSummary: [
        "**Dios** nos da valentía en cada momento y nunca nos abandona en las pruebas.",
        "## Recordemos que confiar en el Señor fortalece nuestro corazón cada día.",
      ],
    });
    const parsed = parseAndValidateGeminiResponse(withMd);
    expect(parsed.parentSummary.join(" ")).not.toContain("**");
    expect(parsed.parentSummary.join(" ")).not.toContain("##");
  });

  it("ejecuta backoff exponencial ante HTTP 429 y se recupera sin perder la lección", async () => {
    const sleepCalls: number[] = [];
    let calls = 0;
    const mockCaller = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const err = Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
        throw err;
      }
      return JSON.stringify(validPayload);
    });

    const out = await generateLessonWithGemini(
      { lessonNumber: 1, rawText: "Texto largo de ejemplo de la lección bíblica para padres." },
      {
        callGemini: mockCaller,
        sleep: async (ms) => {
          sleepCalls.push(ms);
        },
        baseDelayMs: 100,
      },
    );

    expect(calls).toBe(3);
    expect(sleepCalls).toEqual([100, 200]);
    expect(out.title).toBe("David y Goliat");
  });
});

describe("Hito 3 — DST America/Santiago en unlock_at y semanas", () => {
  it("calcula lunes 00:01 local exacto en invierno (UTC-4) y verano (UTC-3)", () => {
    // Invierno junio 2026 (CLT UTC-4)
    expect(computeUnlockAtFromSunday("2026-06-07").toISOString()).toBe("2026-06-08T04:01:00.000Z");
    // Verano enero 2026 (CLST UTC-3)
    expect(computeUnlockAtFromSunday("2026-01-11").toISOString()).toBe("2026-01-12T03:01:00.000Z");
  });

  it("mantiene exactamente 00:01 hora Chile cruzando cambios de hora CLT <-> CLST", () => {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Santiago",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    // Primer sábado de abril (CLST->CLT) y septiembre (CLT->CLST)
    for (const sunday of ["2026-04-05", "2026-09-06"]) {
      const unlock = computeUnlockAtFromSunday(sunday);
      expect(fmt.format(unlock)).toBe("00:01");
    }
  });

  it("resuelve inicio_lunes_00_00_chile y domingo_semana_en_curso correctamente", () => {
    // Domingo 2026-05-10 23:59 Chile = 2026-05-11 03:59 UTC
    const sundayNight = new Date("2026-05-11T03:59:00Z");
    expect(currentMondayStartUtc(sundayNight).toISOString()).toBe("2026-05-04T04:00:00.000Z");
    expect(currentWeekSundayInSantiago(sundayNight)).toBe("2026-05-10");

    // Lunes 2026-05-11 00:01 Chile = 2026-05-11 04:01 UTC
    const mondayMorning = new Date("2026-05-11T13:00:00Z"); // 09:00 AM Chile
    expect(currentMondayStartUtc(mondayMorning).toISOString()).toBe("2026-05-11T04:00:00.000Z");
    expect(currentWeekSundayInSantiago(mondayMorning)).toBe("2026-05-10");
  });
});
