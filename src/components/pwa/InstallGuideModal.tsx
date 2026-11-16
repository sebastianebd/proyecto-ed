"use client";

import { Share, Smartphone, X } from "lucide-react";

export function PwaInstallSteps() {
  return (
    <div className="space-y-3 text-sm text-fg">
      <div className="rounded-xl border border-border bg-bg p-3.5">
        <p className="font-semibold text-fg">En Android (Chrome)</p>
        <p className="mt-1 text-fg-muted">
          Toca el menú <strong>⋮</strong> (arriba a la derecha) y elige <strong>&ldquo;Instalar aplicación&rdquo;</strong>{" "}
          o <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>.
        </p>
      </div>
      <div className="rounded-xl border border-tint-border bg-tint p-3.5">
        <p className="flex items-center gap-1.5 font-semibold text-tint-text">
          <Share className="h-4 w-4" /> En iPhone / iPad (Safari)
        </p>
        <p className="mt-1 text-fg">
          Abre la app en <strong>Safari</strong>, toca el ícono <strong>Compartir</strong> (cuadro con flecha hacia arriba)
          y selecciona <strong>&ldquo;Agregar a inicio&rdquo;</strong>. Luego abre la app desde el ícono nuevo.
        </p>
      </div>
    </div>
  );
}

export function InstallGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-guide-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pwa-guide-title" className="flex items-center gap-2 text-base font-bold text-fg">
            <Smartphone className="h-5 w-5 text-primary" /> Instalar app en tu celular
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-fg-muted hover:bg-locked-bg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PwaInstallSteps />
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
