import PDFDocument = require('pdfkit');
import { join } from 'node:path';
import { existsSync } from 'node:fs';

type Cell = string | number | boolean | null | undefined;

/** One CSV cell: quoted when it holds a comma, quote or newline. */
export function csvCell(value: Cell): string {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  // BOM so Excel reads Arabic text as UTF-8.
  return '﻿' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Row objects (as the report sections hold them) to CSV, columns from the first row. */
export function rowsToCsv(rows: Array<Record<string, Cell>>): string[][] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return [keys, ...rows.map((row) => keys.map((key) => row[key] as Cell))].map((r) => r.map((c) => (c == null ? '' : String(c))));
}

export interface PdfTable {
  title: string;
  headers: string[];
  rows: Cell[][];
  emptyNote?: string;
}

export interface PdfInput {
  title: string;
  subtitle?: string;
  facts?: Array<[string, string]>;
  tables: PdfTable[];
  footer?: string;
}

/** A font that has Arabic glyphs, bundled so the server does not depend on system fonts. */
function fontPath(): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'assets', 'fonts', 'DejaVuSans.ttf'),
    join(process.cwd(), 'assets', 'fonts', 'DejaVuSans.ttf'),
    '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const ARABIC = /[؀-ۿ]/;

/**
 * Arabic text is shaped by the font but PDFKit lays it out left to right, so a
 * purely Arabic cell is reversed word by word to read correctly.
 */
function visual(text: string): string {
  if (!ARABIC.test(text)) return text;
  return text.split(' ').reverse().join(' ');
}

/** A simple paginated report: title, key facts, then one table per section. */
export function renderPdf(input: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const font = fontPath();
    if (font) {
      doc.registerFont('Body', font);
      doc.font('Body');
    }
    const width = doc.page.width - 80;

    doc.fontSize(18).fillColor('#111').text(visual(input.title));
    if (input.subtitle) doc.moveDown(0.2).fontSize(10).fillColor('#555').text(visual(input.subtitle));
    doc.moveDown(0.8);

    for (const [label, value] of input.facts ?? []) {
      doc.fontSize(10).fillColor('#111').text(`${label}: ${visual(value)}`);
    }
    if (input.facts?.length) doc.moveDown(0.6);

    for (const table of input.tables) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.fontSize(12).fillColor('#111').text(visual(table.title));
      doc.moveDown(0.3);

      if (table.rows.length === 0) {
        doc.fontSize(9).fillColor('#666').text(table.emptyNote ?? 'Nothing to report.');
        doc.moveDown(0.8);
        continue;
      }

      const columns = table.headers.length;
      const colWidth = width / columns;
      const drawRow = (cells: Cell[], bold: boolean) => {
        const texts = cells.map((cell) => visual(cell == null ? '' : String(cell)));
        const height =
          Math.max(...texts.map((text) => doc.fontSize(8).heightOfString(text, { width: colWidth - 6 }))) + 6;
        if (doc.y + height > doc.page.height - 60) doc.addPage();
        const y = doc.y;
        if (bold) doc.rect(40, y - 1, width, height).fill('#eee');
        doc.fillColor('#111').fontSize(8);
        texts.forEach((text, index) => doc.text(text, 40 + index * colWidth + 3, y + 2, { width: colWidth - 6 }));
        doc.y = y + height;
        doc.x = 40;
      };

      drawRow(table.headers, true);
      for (const row of table.rows) drawRow(row, false);
      doc.moveDown(0.8);
    }

    if (input.footer) {
      doc.fontSize(8).fillColor('#666').text(visual(input.footer), 40, doc.y, { width });
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).fillColor('#999').text(`PriceLens · ${i + 1}/${range.count}`, 40, doc.page.height - 30, {
        width,
        align: 'center',
        lineBreak: false,
      });
    }
    doc.end();
  });
}
