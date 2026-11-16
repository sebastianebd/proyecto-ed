import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_PDF_BYTES, UNIT_PDF_BUCKET } from "@/lib/storage-constants";

export { MAX_PDF_BYTES, UNIT_PDF_BUCKET };

let cachedClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configuradas");
  }
  cachedClient = createClient(new URL(url).origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}

export function buildUnitPdfKey(classId: string): string {
  return `units/${classId}/${crypto.randomUUID()}.pdf`;
}

export type StorageAdapter = {
  createSignedUploadUrl: (storageKey: string) => Promise<{ signedUrl: string; token: string; path: string }>;
  createSignedDownloadUrl: (storageKey: string, expiresInSeconds?: number) => Promise<string>;
  getObjectInfo: (storageKey: string) => Promise<{ size: number; contentType?: string } | null>;
  downloadBuffer: (storageKey: string) => Promise<Buffer>;
  removeObject: (storageKey: string) => Promise<void>;
};

export const storage: StorageAdapter = {
  async createSignedUploadUrl(storageKey) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(UNIT_PDF_BUCKET)
      .createSignedUploadUrl(storageKey, { upsert: false });
    if (error || !data) throw new Error(error?.message ?? "No se pudo generar URL de subida");
    return data;
  },

  async createSignedDownloadUrl(storageKey, expiresInSeconds = 60) {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(UNIT_PDF_BUCKET)
      .createSignedUrl(storageKey, expiresInSeconds, { download: true });
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "No se pudo generar URL de descarga");
    return data.signedUrl;
  },

  async getObjectInfo(storageKey) {
    const { data, error } = await getSupabaseAdmin().storage.from(UNIT_PDF_BUCKET).info(storageKey);
    if (error || !data) return null;
    const rawMeta = data.metadata as { size?: number; mimetype?: string } | undefined;
    const size = Number(data.size ?? rawMeta?.size ?? 0);
    const contentType = data.contentType ?? rawMeta?.mimetype;
    return { size, contentType };
  },

  async downloadBuffer(storageKey) {
    const { data, error } = await getSupabaseAdmin().storage.from(UNIT_PDF_BUCKET).download(storageKey);
    if (error || !data) throw new Error(error?.message ?? "No se pudo descargar el PDF desde Storage");
    return Buffer.from(await data.arrayBuffer());
  },

  async removeObject(storageKey) {
    const { error } = await getSupabaseAdmin().storage.from(UNIT_PDF_BUCKET).remove([storageKey]);
    if (error) console.error("[storage] error eliminando objeto:", storageKey, error.message);
  },
};
