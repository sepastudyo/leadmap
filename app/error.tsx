"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Root error boundary (architecture.md §15 "Sentry error monitoring
 * wired in"). Catches uncaught render errors anywhere under the root
 * layout that a more specific `error.tsx` doesn't already handle.
 * Client Component — required for error boundaries
 * (node_modules/next/dist/docs/.../file-conventions/error.md).
 */
export default function ErrorPage({
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        An unexpected error occurred. Try again, or head back home.
      </p>
      <Button onClick={() => unstable_retry()}>Try again</Button>
    </div>
  );
}
