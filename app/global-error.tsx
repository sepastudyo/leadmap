"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "./globals.css";

/**
 * Root-layout-level error boundary (architecture.md §15). Only fires
 * when the root layout itself fails to render, so it must supply its
 * own `<html>`/`<body>` and stay dependency-light — a plain `<button>`
 * rather than `components/ui/button`, since this is the last line of
 * defense if something upstream of that component breaks too
 * (node_modules/next/dist/docs/.../file-conventions/error.md).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred. Try again, or reload the page.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
