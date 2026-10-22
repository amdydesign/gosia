/**
 * Extract the text layer of a PDF in the browser (pdf.js, loaded on demand),
 * so the server can index contracts without any PDF library or paid OCR.
 * Scanned PDFs have no text layer - they come back as an empty string.
 */

import { loadPdfjs } from './pdfjs';

const MAX_PAGES = 200;
const MAX_CHARS = 1000000;

export async function extractPdfText(file) {
    const pdfjs = await loadPdfjs();

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

    try {
        const pages = [];
        let length = 0;
        for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES) && length < MAX_CHARS; n += 1) {
            const page = await pdf.getPage(n);
            const content = await page.getTextContent();
            const text = content.items
                .map((item) => (item.str || '') + (item.hasEOL ? '\n' : ''))
                .join('')
                .trim();
            pages.push(text);
            length += text.length;
        }
        return pages.join('\n\n').slice(0, MAX_CHARS).trim();
    } finally {
        pdf.destroy();
    }
}
