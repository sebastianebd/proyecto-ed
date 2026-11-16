import { extractText } from "unpdf";

// Motor PDF exclusivo sobre `unpdf` (docs/02 §4.2, docs/03 §5.2, docs/05 §2.4).

export type PdfLessonDraft = {
  lessonNumber: number;
  title: string;
  rawText: string;
};

export type PdfExtractionResult = {
  scannedWarning: boolean;
  totalPages: number;
  drafts: PdfLessonDraft[];
};

const PDF_MAGIC = Buffer.from("%PDF-");

/** Verifica magic bytes `%PDF-` al inicio del archivo. */
export function hasPdfMagicBytes(buffer: Buffer | Uint8Array): boolean {
  if (buffer.byteLength < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (buffer[i] !== PDF_MAGIC[i]) return false;
  }
  return true;
}

type MatchHit = {
  lessonNumber: number;
  index: number;
  lineLength: number;
  titleHint: string;
};

const HEADING_RE = /^[ \t]*(?:lecci[oó]n|tema|clase)\s+(\d{1,2})\b[ \t.:–—-]*([^\n]*)$/gim;
const TOC_PAGE_TAIL_RE = /(?:\.{2,}|\s{2,})\s*\d{1,3}\s*$/;

/**
 * Divide el texto plano del PDF en 14 borradores editables, saltando portada e índice
 * inicial (aunque el índice repita "Lección 1..14"). Si el PDF es escaneado o vacío,
 * retorna `scannedWarning: true` y 14 borradores vacíos sin lanzar excepción.
 */
export function splitUnitPdfTextInto14Drafts(rawPdfText: string, totalPages = 0): PdfExtractionResult {
  const text = rawPdfText.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

  if (text.length < 50) {
    return {
      scannedWarning: true,
      totalPages,
      drafts: Array.from({ length: 14 }, (_, i) => ({
        lessonNumber: i + 1,
        title: `Lección ${i + 1}`,
        rawText: "",
      })),
    };
  }

  // Recopilar todos los posibles encabezados de Lección 1..14
  const hits: MatchHit[] = [];
  for (const m of text.matchAll(HEADING_RE)) {
    const n = Number(m[1]);
    if (n < 1 || n > 14 || m.index === undefined) continue;
    const rawTitle = (m[2] ?? "").trim();
    hits.push({
      lessonNumber: n,
      index: m.index,
      lineLength: m[0].length,
      titleHint: rawTitle,
    });
  }

  // Filtrar ocurrencias que parecen líneas de tabla de contenido / índice:
  // 1) terminan en líderes de puntos o número de página (... 14)
  // 2) la distancia hasta el siguiente encabezado es mínima (< 180 chars)
  const realByLesson = new Map<number, MatchHit>();
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const next = hits[i + 1];
    const spanToNext = (next ? next.index : text.length) - (h.index + h.lineLength);
    const looksLikeToc = TOC_PAGE_TAIL_RE.test(h.titleHint) || spanToNext < 180;
    if (looksLikeToc) continue;

    // Si hay múltiples candidatos no-TOC para el mismo número, preferimos el primero sustancial
    // o el de mayor contenido siguiente si el primero fuera apenas una mención corta.
    const prev = realByLesson.get(h.lessonNumber);
    if (!prev) {
      realByLesson.set(h.lessonNumber, h);
    }
  }

  // Si logramos detectar al menos 4 encabezados reales de lección, cortamos cronológicamente desde allí
  // (saltando portada e índice que preceden al primer encabezado real).
  const ordered = Array.from(realByLesson.values()).sort((a, b) => a.index - b.index);
  if (ordered.length >= 4) {
    const drafts: PdfLessonDraft[] = [];
    for (let n = 1; n <= 14; n++) {
      const idx = ordered.findIndex((h) => h.lessonNumber === n);
      if (idx === -1) {
        drafts.push({ lessonNumber: n, title: `Lección ${n}`, rawText: "" });
        continue;
      }
      const start = ordered[idx].index;
      const end = idx + 1 < ordered.length ? ordered[idx + 1].index : text.length;
      const slice = text.slice(start, end).trim();
      const hint = ordered[idx].titleHint.replace(TOC_PAGE_TAIL_RE, "").trim();
      const title = hint.length >= 3 && hint.length <= 120 ? hint : `Lección ${n}`;
      drafts.push({ lessonNumber: n, title, rawText: slice });
    }
    return { scannedWarning: false, totalPages, drafts };
  }

  // Fallback seguro si el PDF no usa "Lección N": dividir el texto en 14 bloques equitativos por párrafos.
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks = paragraphs.length >= 14 ? paragraphs : text.split("\n").filter((p) => p.trim().length > 0);
  const perLesson = Math.max(1, Math.ceil(chunks.length / 14));
  const drafts: PdfLessonDraft[] = Array.from({ length: 14 }, (_, i) => {
    const part = chunks.slice(i * perLesson, i === 13 ? undefined : (i + 1) * perLesson).join("\n\n").trim();
    return { lessonNumber: i + 1, title: `Lección ${i + 1}`, rawText: part };
  });
  return { scannedWarning: false, totalPages, drafts };
}

/** Valida `%PDF-`, extrae texto con `unpdf` y separa en 14 borradores editables. */
export async function extractAndSplitUnitPdf(buffer: Buffer | Uint8Array): Promise<PdfExtractionResult> {
  if (!hasPdfMagicBytes(buffer)) {
    throw new Error("El archivo no corresponde a un PDF válido (firma %PDF- ausente)");
  }

  const { totalPages, text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return splitUnitPdfTextInto14Drafts(text ?? "", totalPages ?? 0);
}
