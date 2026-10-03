import { writeFileSync } from 'node:fs';
import { renderPdf } from '../../src/brand/export-formats';

describe('renderPdf layout', () => {
  it('keeps a short document on one page', async () => {
    const pdf = await renderPdf({ title: 'T', tables: [{ title: 'Items', headers: ['#', 'Name'], rows: [[1, 'a']] }] });
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    if (process.env.PDF_OUT) {
      const arabic = await renderPdf({ title: 'عرض سعر: شاشة', subtitle: 'شركة الاختبار', facts: [['الإجمالي', '1,000 EGP']], tables: [{ title: 'البنود', headers: ['#', 'المنتج', 'المتجر'], rows: [[1, 'شاشة سامسونج ٢٤ بوصة', 'جوميا'], [2, 'Lenovo IdeaPad 3', 'Noon']] }] });
      writeFileSync(process.env.PDF_OUT, arabic);
    }
  });
});
