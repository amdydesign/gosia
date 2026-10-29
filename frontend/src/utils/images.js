/**
 * Screenshot preparation for AI reading: decode, downscale and cut very tall
 * (scrolling) screenshots into readable tiles; PDF pages are drawn first. Returns base64 JPEGs.
 */

import { loadPdfjs } from './pdfjs';

const MAX_LONG_EDGE = 2000;
const TILE_RATIO = 2.2; // tile height / width for tall screenshots
const MAX_TILES = 8;
const QUALITY = 0.85;

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Nie udało się otworzyć obrazu. Użyj JPG lub PNG.'));
        };
        img.src = url;
    });
}

function toBase64Jpeg(img, sx, sy, sw, sh) {
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
}

/** PDF pages (a brief, a contract) as JPEGs - rendered on the device with pdf.js. */
async function pdfPages(file, limit) {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const out = [];
    try {
        for (let n = 1; n <= Math.min(pdf.numPages, limit); n += 1) {
            const page = await pdf.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / Math.max(base.width, base.height)) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            out.push({ media_type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', QUALITY).split(',')[1] });
        }
    } finally {
        pdf.destroy();
    }
    return out;
}

export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');

/**
 * @param {File[]|Blob[]} files  screenshots / photos, or PDFs (first pages)
 * @returns {Promise<{media_type: string, data: string}[]>}
 */
export async function prepareImagesForAi(files) {
    const out = [];
    for (const file of files) {
        if (out.length >= MAX_TILES) break;
        if (isPdf(file)) {
            out.push(...(await pdfPages(file, MAX_TILES - out.length)));
            continue;
        }
        const img = await loadImage(file);
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        if (h / w <= TILE_RATIO + 0.4) {
            out.push({ media_type: 'image/jpeg', data: toBase64Jpeg(img, 0, 0, w, h) });
            continue;
        }

        // Tall screenshot: overlapping slices so no line gets cut in half
        const tileH = Math.round(w * TILE_RATIO);
        const overlap = Math.round(tileH * 0.06);
        for (let y = 0; y < h && out.length < MAX_TILES; y += tileH - overlap) {
            const sh = Math.min(tileH, h - y);
            if (sh < w * 0.15 && y > 0) break; // tiny leftover strip
            out.push({ media_type: 'image/jpeg', data: toBase64Jpeg(img, 0, y, w, sh) });
            if (y + sh >= h) break;
        }
    }
    return out;
}

/** Image files from a paste / drop event. */
export function imagesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];
    const files = [];
    for (const item of dataTransfer.items || []) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    if (!files.length) {
        for (const file of dataTransfer.files || []) {
            if (file.type.startsWith('image/')) files.push(file);
        }
    }
    return files;
}

/** Read images from the clipboard (button press). Returns [] when not supported/denied. */
export async function imagesFromClipboard() {
    if (!navigator.clipboard?.read) return [];
    try {
        const items = await navigator.clipboard.read();
        const files = [];
        for (const item of items) {
            const type = item.types.find((t) => t.startsWith('image/'));
            if (type) {
                const blob = await item.getType(type);
                files.push(new File([blob], `screen.${type.split('/')[1] || 'png'}`, { type }));
            }
        }
        return files;
    } catch {
        return [];
    }
}
