import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Locale } from '@/lib/i18n/config';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { I18nProvider } from '@/lib/i18n/provider';

/** render() inside the i18n provider the [locale] layout supplies in the app. */
export function renderWithI18n(ui: ReactElement, locale: Locale = 'en', options?: RenderOptions) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <I18nProvider locale={locale} dict={dictionaries[locale]}>
        {children}
      </I18nProvider>
    ),
  });
}
