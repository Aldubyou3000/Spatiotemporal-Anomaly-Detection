import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      // Filtered retry: transient network/5xx retries with backoff; 401/403/404 never retry.
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        if (error instanceof Error && (error as unknown as { status?: number }).status != null) {
          const s = (error as unknown as { status: number }).status;
          if ([401, 403, 404].includes(s)) return false;
        }
        const msg = error instanceof Error ? error.message : String(error);
        if (/Session expired|Not authenticated|timed out/i.test(msg) && !/Network/i.test(msg)) return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
