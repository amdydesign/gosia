/**
 * Document scanner (like iOS Files -> "Scan document"), all on the device:
 * find the sheet of paper in a photo, straighten it (perspective warp)
 * and clean it up so it looks like a scan.
 */

const MAX_SIDE = 3200; // working resolution of a page photo (small print must stay readable)
const DETECT_SIDE = 320; // resolution used to look for the sheet

/** Load a photo (File/Blob) into a canvas, EXIF orientation applied, long side <= MAX_SIDE. */
export async function loadPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Nie udało się otworzyć zdjęcia'));
            image.src = url;
        });
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Rotate a canvas by 90° clockwise. */
export function rotateCanvas(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.height;
    canvas.height = source.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, 0, 0);
    return canvas;
}

/** Corners [tl, tr, br, bl] inset from the photo edges (fallback when no sheet is found). */
export function defaultCorners(width, height, inset = 0.06) {
    const dx = width * inset;
    const dy = height * inset;
    return [
        { x: dx, y: dy },
        { x: width - dx, y: dy },
        { x: width - dx, y: height - dy },
        { x: dx, y: height - dy },
    ];
}

let detectCanvas = null;

/** Cross product sign check: corners form a convex, sensibly sized quadrilateral. */
function isPlausibleQuad(corners, width, height) {
    let sign = 0;
    for (let i = 0; i < 4; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const c = corners[(i + 2) % 4];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        if (Math.abs(cross) < 1e-6) return false;
        const s = Math.sign(cross);
        if (sign && s !== sign) return false;
        sign = s;
    }
    let area = 0;
    for (let i = 0; i < 4; i += 1) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    const ratio = area / (width * height);
    if (ratio < 0.15 || ratio > 0.98) return false;
    // every side at least 25% of the shorter frame side
    const minSide = Math.min(width, height) * 0.25;
    for (let i = 0; i < 4; i += 1) if (dist(corners[i], corners[(i + 1) % 4]) < minSide) return false;
    return true;
}

/**
 * Find the sheet of paper: it is usually the largest bright area. Threshold the
 * downscaled image (Otsu), keep the biggest bright blob and take its extreme points
 * as corners. Works on a canvas, image or a live <video>.
 * Returns [tl, tr, br, bl] in source pixels; when nothing convincing is found it
 * returns inset default corners, or null with { fallback: false }.
 */
export function detectCorners(source, { fallback = true } = {}) {
    const srcW = source.videoWidth || source.width;
    const srcH = source.videoHeight || source.height;
    const notFound = () => (fallback ? defaultCorners(srcW, srcH) : null);
    if (!srcW || !srcH) return notFound();
    const scale = Math.min(1, DETECT_SIDE / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    detectCanvas = detectCanvas || document.createElement('canvas');
    const small = detectCanvas;
    small.width = w;
    small.height = h;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.filter = 'blur(2px)';
    sctx.drawImage(source, 0, 0, w, h);
    const { data } = sctx.getImageData(0, 0, w, h);

    const gray = new Uint8Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i += 1) {
        const g = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
        gray[i] = g;
        hist[gray[i]] += 1;
    }

    // Otsu threshold
    const total = w * h;
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let threshold = 128;
    for (let t = 0; t < 256; t += 1) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) {
            best = between;
            threshold = t;
        }
    }

    // Largest bright connected component (4-neighbourhood, iterative flood fill)
    const label = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    let bestLabel = 0;
    let bestSize = 0;
    let current = 0;
    for (let start = 0; start < total; start += 1) {
        if (label[start] || gray[start] <= threshold) continue;
        current += 1;
        let size = 0;
        let top = 0;
        stack[top++] = start;
        label[start] = current;
        while (top) {
            const p = stack[--top];
            size += 1;
            const x = p % w;
            const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
            for (const q of neighbours) {
                if (q >= 0 && q < total && !label[q] && gray[q] > threshold) {
                    label[q] = current;
                    stack[top++] = q;
                }
            }
        }
        if (size > bestSize) {
            bestSize = size;
            bestLabel = current;
        }
    }

    // Too small or the whole frame -> probably not a sheet on a background
    if (bestSize < total * 0.12 || bestSize > total * 0.97) return notFound();

    let tl = null;
    let tr = null;
    let br = null;
    let bl = null;
    for (let p = 0; p < total; p += 1) {
        if (label[p] !== bestLabel) continue;
        const x = p % w;
        const y = (p - x) / w;
        if (!tl || x + y < tl.x + tl.y) tl = { x, y };
        if (!br || x + y > br.x + br.y) br = { x, y };
        if (!tr || x - y > tr.x - tr.y) tr = { x, y };
        if (!bl || x - y < bl.x - bl.y) bl = { x, y };
    }
    const corners = [tl, tr, br, bl].map((c) => ({ x: (c.x + 0.5) / scale, y: (c.y + 0.5) / scale }));
    return isPlausibleQuad(corners, srcW, srcH) ? corners : notFound();
}

/** Copy the current video frame (full camera resolution) into a canvas. */
export function grabFrame(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas;
}

/** Solve the 8x8 system for the homography mapping 4 src points onto 4 dst points. */
function homography(src, dst) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i += 1) {
        const { x, y } = src[i];
        const { x: u, y: v } = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
        b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
        b.push(v);
    }
    // Gaussian elimination with partial pivoting
    for (let col = 0; col < 8; col += 1) {
        let pivot = col;
        for (let r = col + 1; r < 8; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        [A[col], A[pivot]] = [A[pivot], A[col]];
        [b[col], b[pivot]] = [b[pivot], b[col]];
        for (let r = 0; r < 8; r += 1) {
            if (r === col) continue;
            const f = A[r][col] / A[col][col];
            for (let c = col; c < 8; c += 1) A[r][c] -= f * A[col][c];
            b[r] -= f * b[col];
        }
    }
    const h = b.map((value, i) => value / A[i][i]);
    return [...h, 1];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Straighten the quadrilateral [tl, tr, br, bl] of the photo into a flat page. */
export function warpPerspective(source, corners) {
    const [tl, tr, br, bl] = corners;
    let outW = Math.max(dist(tl, tr), dist(bl, br));
    let outH = Math.max(dist(tl, bl), dist(tr, br));
    const scale = Math.min(1, MAX_SIDE / Math.max(outW, outH));
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));

    // Map output pixels back to the photo
    const H = homography(
        [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
        corners
    );

    const sw = source.width;
    const sh = source.height;
    const src = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const octx = out.getContext('2d');
    const img = octx.createImageData(outW, outH);
    const dst = img.data;

    for (let y = 0; y < outH; y += 1) {
        for (let x = 0; x < outW; x += 1) {
            const d = H[6] * x + H[7] * y + 1;
            const sx = (H[0] * x + H[1] * y + H[2]) / d;
            const sy = (H[3] * x + H[4] * y + H[5]) / d;
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) continue;
            const fx = sx - x0;
            const fy = sy - y0;
            const i00 = (y0 * sw + x0) * 4;
            const i10 = i00 + 4;
            const i01 = i00 + sw * 4;
            const i11 = i01 + 4;
            const o = (y * outW + x) * 4;
            for (let c = 0; c < 3; c += 1) {
                const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
                const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
                dst[o + c] = top + (bottom - top) * fy;
            }
            dst[o + 3] = 255;
        }
    }
    octx.putImageData(img, 0, 0);
    return out;
}

/** Gentle unsharp mask on the luminance (3x3), makes small print crisper. */
function sharpen(ctx, w, h, amount = 0.6) {
    const img = ctx.getImageData(0, 0, w, h);
    const p = img.data;
    const src = new Uint8ClampedArray(p);
    for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
            const i = (y * w + x) * 4;
            for (let c = 0; c < 3; c += 1) {
                const blur = (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c]) / 4;
                p[i + c] = src[i + c] + (src[i + c] - blur) * amount;
            }
        }
    }
    ctx.putImageData(img, 0, 0);
}

/**
 * Make the page look scanned without losing faint print or handwriting.
 * The paper brightness is estimated per area (removes shadows and uneven light),
 * each pixel is divided by it, then a soft levels curve maps paper to white and
 * keeps grey text grey. "scan" = greyscale, "color" = colours kept.
 */
export function enhance(source, mode = 'scan') {
    const w = source.width;
    const h = source.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    if (mode === 'original') return out;

    // Paper brightness: max-ish of a small copy, blurred, scaled back up
    const bg = document.createElement('canvas');
    bg.width = Math.max(1, Math.round(w / 24));
    bg.height = Math.max(1, Math.round(h / 24));
    const bctx = bg.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(source, 0, 0, bg.width, bg.height);
    // lift the background estimate over thin dark strokes (3x3 max filter)
    const bimg = bctx.getImageData(0, 0, bg.width, bg.height);
    const bsrc = new Uint8ClampedArray(bimg.data);
    for (let y = 0; y < bg.height; y += 1) {
        for (let x = 0; x < bg.width; x += 1) {
            const o = (y * bg.width + x) * 4;
            for (let c = 0; c < 3; c += 1) {
                let m = 0;
                for (let dy = -1; dy <= 1; dy += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        const xx = Math.min(bg.width - 1, Math.max(0, x + dx));
                        const yy = Math.min(bg.height - 1, Math.max(0, y + dy));
                        m = Math.max(m, bsrc[(yy * bg.width + xx) * 4 + c]);
                    }
                }
                bimg.data[o + c] = m;
            }
        }
    }
    bctx.putImageData(bimg, 0, 0);
    const big = document.createElement('canvas');
    big.width = w;
    big.height = h;
    const gctx = big.getContext('2d', { willReadFrequently: true });
    gctx.filter = 'blur(6px)';
    gctx.imageSmoothingQuality = 'high';
    gctx.drawImage(bg, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const p = img.data;
    const b = gctx.getImageData(0, 0, w, h).data;
    const BLACK = 0.25; // ratio that becomes full black
    const WHITE = 0.93; // ratio that becomes paper white
    const level = (r) => {
        const v = Math.min(1, Math.max(0, (r - BLACK) / (WHITE - BLACK)));
        return Math.round(Math.pow(v, 1.15) * 255);
    };

    for (let i = 0; i < p.length; i += 4) {
        if (mode === 'scan') {
            const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
            const bgG = Math.max(1, 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]);
            p[i] = p[i + 1] = p[i + 2] = level(g / bgG);
        } else {
            for (let c = 0; c < 3; c += 1) p[i + c] = level(p[i + c] / Math.max(1, b[i + c]));
        }
    }
    ctx.putImageData(img, 0, 0);
    sharpen(ctx, w, h);
    return out;
}

/** Join page canvases into one A4-wide PDF (JPEG pages). Returns a File. */
export async function pagesToPdf(pages, fileName) {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    for (const canvas of pages) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
        const jpg = await pdf.embedJpg(await blob.arrayBuffer());
        const width = 595; // A4 width in points
        const height = (canvas.height / canvas.width) * width;
        const page = pdf.addPage([width, height]);
        page.drawImage(jpg, { x: 0, y: 0, width, height });
    }
    const bytes = await pdf.save();
    return new File([bytes], fileName, { type: 'application/pdf' });
}
