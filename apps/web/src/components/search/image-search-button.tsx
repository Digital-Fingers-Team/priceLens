'use client';

import { useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/lib/api/client';
import { useEntitlement } from '@/lib/hooks/use-billing';
import { useApiErrorMessage } from '@/lib/hooks/use-api-error';
import { useRouter } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { useUiStore } from '@/lib/store/ui.store';
import { cn } from '@/lib/utils/cn';
import type { ApiResponse } from '@/types/api.types';

interface Recognition {
  found: boolean;
  query: string | null;
  brand: string | null;
  model: string | null;
}

/**
 * Photo or screenshot → what it is → the normal search page for it. Hidden
 * when switched off; for plans without it, a tap goes to the pricing page.
 */
export function ImageSearchButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const access = useEntitlement('image_search');
  const input = useRef<HTMLInputElement>(null);
  const addToast = useUiStore((s) => s.addToast);
  const apiError = useApiErrorMessage();

  const recognise = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('image', file);
      return (await apiClient.post<ApiResponse<Recognition>>('/search/image', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
    },
    onSuccess: (result) => {
      if (!result.found || !result.query) {
        addToast(t.search.imageNotFound, 'info');
        return;
      }
      router.push(`/search?q=${encodeURIComponent(result.query)}`);
    },
    onError: (error: AxiosError) => addToast(apiError(error), 'error'),
  });

  if (access === 'hidden' || access === 'loading') return null;

  return (
    <>
      <button
        type="button"
        aria-label={t.search.byImage}
        title={access === 'locked' ? t.search.byImageLocked : t.search.byImage}
        disabled={recognise.isPending}
        onClick={() => (access === 'locked' ? router.push('/pricing') : input.current?.click())}
        className={cn('flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-fg', className)}
      >
        {recognise.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            addToast(t.search.imageTooBig, 'error');
            return;
          }
          recognise.mutate(file);
        }}
      />
    </>
  );
}
