/**
 * pdf.js loaded on demand. The legacy build is used on purpose: the modern one
 * relies on brand-new JavaScript (e.g. Map.getOrInsertComputed) that iPhone
 * Safari and older browsers lack, so drawing pages (thumbnails, OCR) failed there.
 */
let loading = null;

export function loadPdfjs() {
    if (!loading) {
        loading = Promise.all([
            import('pdfjs-dist/legacy/build/pdf.mjs'),
            import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ]).then(([pdfjs, { default: workerUrl }]) => {
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
            return pdfjs;
        }).catch((err) => {
            loading = null;
            throw err;
        });
    }
    return loading;
}
