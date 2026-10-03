import { writeFileSync } from 'node:fs';
import { bidiSegments, renderPdf } from '../../src/brand/export-formats';

describe('renderPdf layout', () => {
  it('keeps a short document on one page', async () => {
    const pdf = await renderPdf({ title: 'T', tables: [{ title: 'Items', headers: ['#', 'Name'], rows: [[1, 'a']] }] });
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    if (process.env.PDF_OUT) {
      const arabic = await renderPdf({ title: 'Quotation: عرض سعر تجريبي', subtitle: 'شركة الاختبار', facts: [['الإجمالي', '1,000 EGP']], tables: [{ title: 'البنود', headers: ['#', 'المنتج', 'المتجر'], rows: [[1, 'تسليم القاهرة (iPhone 15 128GB)', 'جوميا'], [3, 'شاشة سامسونج ٢٤ بوصة Samsung 24', 'Noon'], [2, 'Lenovo IdeaPad 3', 'Noon']] }] });
      writeFileSync(process.env.PDF_OUT, arabic);
    }
  });

  it('splits Arabic and Latin runs, keeping Latin text intact', () => {
    expect(bidiSegments('Quotation: Smoke')).toEqual(['Quotation: Smoke']);
    expect(bidiSegments('Total: عرض سعر')).toEqual(['Total: ', 'سعر\u00A0عرض']);
    expect(bidiSegments('عرض سعر iPhone 15').join('')).toContain('iPhone 15');
    expect(bidiSegments('٢٤ بوصة').join('')).toContain('24');
  });
});
