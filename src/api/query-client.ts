import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The axios interceptor already retries once after refreshing on 401.
        // Retrying again here would multiply requests against IP-keyed
        // throttles and delay real errors reaching the UI.
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
