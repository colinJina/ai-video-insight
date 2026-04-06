"use client";

import { useState } from "react";

type ExportPdfButtonProps = {
  analysisId: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ExportPdfButton({
  analysisId,
}: ExportPdfButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleExport = async () => {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/analysis/${analysisId}/report/pdf`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "The PDF export failed. Please try again.";

        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? `analysis-${analysisId}.pdf`;
      downloadBlob(blob, filename);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The PDF export failed. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="rounded-xl border border-[color:rgba(88,66,53,0.28)] px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-[color:rgba(255,127,0,0.06)] disabled:opacity-60"
        disabled={isPending}
        onClick={() => {
          void handleExport();
        }}
        type="button"
      >
        {isPending ? "Exporting..." : "Export PDF"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-sm leading-6 text-[#ffb7b7]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
