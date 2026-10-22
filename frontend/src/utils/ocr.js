/**
 * Text recognition (OCR) in the browser with Tesseract and the Polish model.
 * Everything runs on the device; the engine files come from our own server (/ocr/),
 * so a scanned contract never leaves the phone except as the upload to our server.
 */
import { extractPdfText } from './pdfText';

const MAX_OCR_PAGES = 12;
let workerPromise = null;
let progressListener = null;

async function getWorker() {
    if (!workerPromise) {
        workerPromise = (async () => {
            const { createWorker } = await import('tesseract.js');
            return createWorker('pol', 1, {
                workerPath: '/ocr/worker.min.js',
                corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
                langPath: '/ocr',
                gzip: true,
                workerBlobURL: false,
                logger: (m) => {
                    if (m.status === 'recognizing text' && progressListener) progressListener(m.progress);
                },
            });
        })().catch((err) => {
            workerPromise = null;
            throw err;
        });
    }
    return workerPromise;
}

// Tesseract reads best at ~300 dpi: small pages (camera frames) are enlarged first
const OCR_MIN_WIDTH = 2200;

function enlargeForOcr(source) {
    if (!(source instanceof HTMLCanvasElement) || source.width >= OCR_MIN_WIDTH) return source;
    const factor = Math.min(2.5, OCR_MIN_WIDTH / source.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * factor);
    canvas.height = Math.round(source.height * factor);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/** OCR one image (canvas, Blob or File). onProgress(0..1) is optional. */
export async function ocrImage(source, onProgress) {
    const worker = await getWorker();
    progressListener = onProgress || null;
    try {
        const { data } = await worker.recognize(enlargeForOcr(source));
        return (data.text || '').trim();
    } finally {
        progressListener = null;
    }
}

/** OCR the first pages of a scanned PDF (rendered with pdf.js). */
async function ocrPdf(file, onStatus) {
    const [pdfjs, { default: workerUrl }] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    try {
        const total = Math.min(pdf.numPages, MAX_OCR_PAGES);
        const texts = [];
        for (let n = 1; n <= total; n += 1) {
            onStatus?.(`Rozpoznaję tekst… strona ${n}/${total}`);
            const page = await pdf.getPage(n);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            texts.push(await ocrImage(canvas));
        }
        return texts.join('\n\n');
    } finally {
        pdf.destroy();
    }
}

/**
 * Searchable text of a file prepared in the browser:
 * PDF text layer, or OCR for scanned PDFs and photos. Word/Excel are read on the server.
 * Never throws - an empty string just means "search by name only".
 */
export async function documentText(file, onStatus) {
    try {
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
            onStatus?.('Odczytuję tekst…');
            const text = await extractPdfText(file);
            if (text.replace(/\s+/g, '').length >= 40) return text;
            return await ocrPdf(file, onStatus);
        }
        if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) {
            onStatus?.('Rozpoznaję tekst…');
            return await ocrImage(file);
        }
    } catch {
        // OCR is best effort
    }
    return '';
}
