import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithI18n as render } from '@/test/i18n';
import type { BuyVerdict, CurrentMarket } from '@/types/intelligence.types';
import { BuyVerdictCard } from './buy-verdict-card';

const market = { best: null } as unknown as CurrentMarket;

const wait: BuyVerdict = {
  verdict: 'WAIT',
  confidence: 'MEDIUM',
  percentile: 88,
  vsAverage: -4.2,
  aboveLow: 9.5,
  reasons: ['More expensive than 88% of the last 40 days we recorded.', 'It has been as low as 20000 in this period.'],
  reasonCodes: [
    { code: 'PRICIER_THAN_PCT', params: { pct: 88, days: 40 } },
    { code: 'LOW_IN_PERIOD', params: { price: 20_000 } },
  ],
};

describe('BuyVerdictCard reasons (audit 11)', () => {
  afterEach(cleanup);

  it('words the reasons in Arabic in the Arabic UI', () => {
    render(<BuyVerdictCard verdict={wait} market={market} history={null} currency="EGP" windowDays={90} />, 'ar');
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    // The percent sign carries direction marks in Arabic (Intl), hence the \S{1,3}.
    expect(items[0]).toMatch(/^أغلى من 88\S{1,3} من آخر 40 يومًا سجّلناها\.$/);
    expect(items[1]).toMatch(/^وصل سعره إلى .*20,000.* في هذه الفترة\.$/);
    expect(items.join(' ')).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('words them in English in the English UI', () => {
    render(<BuyVerdictCard verdict={wait} market={market} history={null} currency="EGP" windowDays={90} />);
    expect(screen.getAllByRole('listitem')[0].textContent).toBe('More expensive than 88% of the last 40 days we recorded.');
  });

  it('falls back to the API sentences without codes', () => {
    render(
      <BuyVerdictCard verdict={{ ...wait, reasonCodes: undefined }} market={market} history={null} currency="EGP" windowDays={90} />,
      'ar',
    );
    expect(screen.getAllByRole('listitem')[1].textContent).toBe('It has been as low as 20000 in this period.');
  });
});
