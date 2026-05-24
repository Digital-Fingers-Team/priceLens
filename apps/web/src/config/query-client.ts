import { QueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,        // 1 minute — price data changes often
        gcTime: 5 * 60 * 1000,       // 5 minutes in garbage collection
        retry: (failureCount, error: unknown) => {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          // Don't retry on 4xx errors
          if (status != null && status >= 400 && status < 500) {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Singleton for server components
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
