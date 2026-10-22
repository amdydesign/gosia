/**
 * Document scanner (like iOS Files -> "Scan document"), all on the device:
 * find the sheet of paper in a photo, straighten it (perspective warp)
 * and clean it up so it looks like a scan.
 */

const MAX_SIDE = 3200; // working resolution of a page photo (small print must stay readable)
const DETECT_SIDE = 400; // resolution used to look for the sheet
const EDGE_STEP = 14; // brightness step (blurred, 400 px) that counts as the paper edge

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

/** Convex hull (monotone chain), points in counter-clockwise order (y down -> clockwise on screen). */
function convexHull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const triArea = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;

/** Largest-area quadrilateral with vertices on the hull (hull order kept). */
function maxAreaQuad(hull) {
    let pts = hull;
    if (pts.length > 64) {
        const step = pts.length / 64;
        pts = Array.from({ length: 64 }, (_, i) => hull[Math.floor(i * step)]);
    }
    const n = pts.length;
    if (n < 4) return null;
    let best = null;
    let bestArea = 0;
    for (let i = 0; i < n; i += 1) {
        for (let k = i + 2; k < n; k += 1) {
            let a1 = 0;
            let j1 = -1;
            for (let j = i + 1; j < k; j += 1) {
                const a = triArea(pts[i], pts[j], pts[k]);
                if (a > a1) {
                    a1 = a;
                    j1 = j;
                }
            }
            let a2 = 0;
            let l1 = -1;
            for (let l = k + 1; l < n + i; l += 1) {
                const a = triArea(pts[k], pts[l % n], pts[i]);
                if (a > a2) {
                    a2 = a;
                    l1 = l % n;
                }
            }
            if (j1 >= 0 && l1 >= 0 && a1 + a2 > bestArea) {
                bestArea = a1 + a2;
                best = [pts[i], pts[j1], pts[k], pts[l1]];
            }
        }
    }
    return best;
}

/** Fit a line (point + direction) through points by PCA. */
function fitLine(points) {
    const n = points.length;
    let mx = 0;
    let my = 0;
    for (const p of points) {
        mx += p.x;
        my += p.y;
    }
    mx /= n;
    my /= n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (const p of points) {
        sxx += (p.x - mx) * (p.x - mx);
        syy += (p.y - my) * (p.y - my);
        sxy += (p.x - mx) * (p.y - my);
    }
    const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { x: mx, y: my, dx: Math.cos(angle), dy: Math.sin(angle) };
}

function intersect(l1, l2) {
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 1e-6) return null;
    const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / det;
    return { x: l1.x + t * l1.dx, y: l1.y + t * l1.dy };
}

/**
 * Straight edges are more reliable than single corner pixels (bent corners,
 * fingers): fit a line to the outline points along each side and intersect them.
 */
function refineCorners(quad, outline, diag) {
    const lines = [];
    for (let i = 0; i < 4; i += 1) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const len = dist(a, b);
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const near = outline.filter((p) => {
            const t = (p.x - a.x) * ux + (p.y - a.y) * uy;
            const d = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
            return t > len * 0.12 && t < len * 0.88 && d < diag * 0.025;
        });
        if (near.length < 8) return quad;
        lines.push(fitLine(near));
    }
    const refined = [];
    for (let i = 0; i < 4; i += 1) {
        const c = intersect(lines[(i + 3) % 4], lines[i]);
        if (!c || dist(c, quad[i]) > diag * 0.08) return quad;
        refined.push(c);
    }
    return refined;
}

/** Order any 4 points as [tl, tr, br, bl] (clockwise on screen, starting top-left). */
function orderCorners(points) {
    const cx = points.reduce((s, p) => s + p.x, 0) / 4;
    const cy = points.reduce((s, p) => s + p.y, 0) / 4;
    const sorted = points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    let start = 0;
    for (let i = 1; i < 4; i += 1) if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
    return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}

/**
 * Find the sheet of paper. Paper is bright and colourless, so every pixel gets
 * "brightness minus saturation" (separates it from wooden / coloured desks);
 * Otsu splits that into paper / background, the largest paper blob is kept,
 * its convex hull gives the largest quadrilateral, and the four edges are then
 * fitted with straight lines for accurate corners.
 * Works on a canvas, image or a live <video>. Returns [tl, tr, br, bl] in source
 * pixels; when nothing convincing is found: inset defaults, or null with { fallback: false }.
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

    const total = w * h;
    const score = new Uint8Array(total);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < total; i += 1) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const v = Math.max(0, Math.min(255, lum - sat * 0.9));
        score[i] = v;
        hist[score[i]] += 1;
    }

    // Otsu threshold
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
        const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
        if (between > best) {
            best = between;
            threshold = t;
        }
    }

    const label = new Int32Array(total);
    const stack = new Int32Array(total);

    // A: largest paper-like connected component above the Otsu threshold
    const otsuBlob = () => {
        label.fill(0);
        let bestLabel = 0;
        let bestSize = 0;
        let current = 0;
        for (let start = 0; start < total; start += 1) {
            if (label[start] || score[start] <= threshold) continue;
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
                    if (q >= 0 && q < total && !label[q] && score[q] > threshold) {
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
        return { id: bestLabel, size: bestSize };
    };

    // B: grow from the brightest spot near the centre through pixels without a
    // sharp change - a gradual shadow is crossed, the step at the paper edge is not
    const edge = new Uint8Array(total);
    for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
            const p = y * w + x;
            const mag = Math.abs(score[p + 1] - score[p - 1]) + Math.abs(score[p + w] - score[p - w]);
            edge[p] = mag > EDGE_STEP ? 1 : 0;
        }
    }
    const centreBlob = () => {
        label.fill(0);
        let seed = -1;
        for (let y = Math.floor(h * 0.35); y < h * 0.65; y += 1) {
            for (let x = Math.floor(w * 0.35); x < w * 0.65; x += 1) {
                const p = y * w + x;
                if (!edge[p] && (seed < 0 || score[p] > score[seed])) seed = p;
            }
        }
        if (seed < 0) return { id: 0, size: 0 };
        let size = 0;
        let top = 0;
        stack[top++] = seed;
        label[seed] = 1;
        while (top) {
            const p = stack[--top];
            size += 1;
            const x = p % w;
            const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
            for (const q of neighbours) {
                if (q >= 0 && q < total && !label[q] && !edge[q]) {
                    label[q] = 1;
                    stack[top++] = q;
                }
            }
        }
        return { id: 1, size };
    };

    // Outline -> hull -> largest quadrilateral -> straight edges; quality = how much
    // of the quadrilateral the blob fills (a sheet fills it almost completely)
    const quadOf = ({ id, size }, grow = 0) => {
        if (size < total * 0.12 || size > total * 0.97) return null;
        const outline = [];
        const colMin = new Int32Array(w).fill(-1);
        const colMax = new Int32Array(w).fill(-1);
        for (let y = 0; y < h; y += 1) {
            let first = -1;
            let last = -1;
            for (let x = 0; x < w; x += 1) {
                if (label[y * w + x] !== id) continue;
                if (first < 0) first = x;
                last = x;
                if (colMin[x] < 0) colMin[x] = y;
                colMax[x] = y;
            }
            if (first >= 0) outline.push({ x: first, y }, { x: last + 1, y });
        }
        for (let x = 0; x < w; x += 1) if (colMin[x] >= 0) outline.push({ x, y: colMin[x] }, { x, y: colMax[x] + 1 });
        const quad = maxAreaQuad(convexHull(outline));
        if (!quad) return null;
        let corners = orderCorners(refineCorners(orderCorners(quad), outline, Math.hypot(w, h)));
        if (grow) {
            // the edge-limited blob stops just inside the paper edge - push corners out
            const cx = corners.reduce((sum, c) => sum + c.x, 0) / 4;
            const cy = corners.reduce((sum, c) => sum + c.y, 0) / 4;
            corners = corners.map((c) => {
                const d = Math.hypot(c.x - cx, c.y - cy) || 1;
                return { x: c.x + ((c.x - cx) / d) * grow, y: c.y + ((c.y - cy) / d) * grow };
            });
        }
        let area = 0;
        for (let i = 0; i < 4; i += 1) area += corners[i].x * corners[(i + 1) % 4].y - corners[(i + 1) % 4].x * corners[i].y;
        area = Math.abs(area) / 2;
        const fill = area > 0 ? Math.min(1, size / area) : 0;
        const full = corners.map((c) => ({ x: Math.min(srcW, Math.max(0, c.x / scale)), y: Math.min(srcH, Math.max(0, c.y / scale)) }));
        // a quadrilateral glued to the frame edges means the paper merged with the desk
        const margin = Math.max(srcW, srcH) * 0.012;
        const onEdge = full.filter((c) => c.x <= margin || c.y <= margin || c.x >= srcW - margin || c.y >= srcH - margin).length;
        return onEdge < 2 && isPlausibleQuad(full, srcW, srcH) ? { corners: full, fill } : null;
    };

    let bestQuad = quadOf(otsuBlob());
    if (!bestQuad || bestQuad.fill < 0.9) {
        const alt = quadOf(centreBlob(), 3);
        if (alt && (!bestQuad || alt.fill > bestQuad.fill)) bestQuad = alt;
    }
    const corners = bestQuad && bestQuad.fill >= 0.8 ? bestQuad.corners : null;
    return corners || notFound();
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
export function enhance(source, mode = 'color') {
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
    // Soft levels: paper -> white, everything else keeps its tone (no harsh contrast)
    const BLACK = 0.06; // ratio that becomes full black
    const WHITE = 0.96; // ratio that becomes paper white
    const level = (r) => Math.round(Math.min(1, Math.max(0, (r - BLACK) / (WHITE - BLACK))) * 255);

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
    sharpen(ctx, w, h, 0.35);
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
