'use client';
import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { getApiErrorMessage } from '@/lib/utils/api-error';

/** getApiErrorMessage with the generic messages in the UI language. */
export function useApiErrorMessage() {
  const { t } = useI18n();
  return useCallback((err: unknown, fallback?: string) => getApiErrorMessage(err, fallback, t.errors.api), [t]);
}
