/**
 * First-page thumbnails for the document card, made on the device from the
 * protected file (PDF via pdf.js, photos as they are). Kept in memory per document.
 */
import documentsService from '../services/documents';
import { loadPdfjs } from './pdfjs';

const cache = new Map(); // id -> Promise<{ url, pages } | null>

async function renderPdf(file) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    try {
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 640 / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return { url: canvas.toDataURL('image/jpeg', 0.8), pages: pdf.numPages };
    } finally {
        pdf.destroy();
    }
}

/** { url, pages } for PDFs and photos, null for other formats or on error. */
export function documentThumbnail(doc) {
    if (!cache.has(doc.id)) {
        const job = (async () => {
            const isPdf = doc.mime_type === 'application/pdf';
            const isImage = /^image\/(jpeg|png|webp|gif)$/.test(doc.mime_type || '');
            if (!isPdf && !isImage) return null;
            const file = await documentsService.file(doc);
            if (isPdf) return renderPdf(file);
            return { url: URL.createObjectURL(file), pages: 1 };
        })().catch(() => {
            cache.delete(doc.id);
            return null;
        });
        cache.set(doc.id, job);
    }
    return cache.get(doc.id);
}

/** Forget a thumbnail (after the document was deleted). */
export function forgetThumbnail(id) {
    cache.delete(id);
}
