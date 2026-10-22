import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, RotateCw, Check, Plus, Trash2, Crop, Loader2 } from 'lucide-react';
import { loadPhoto, detectCorners, defaultCorners, warpPerspective, enhance, rotateCanvas } from '../../utils/scanner';

const FILTERS = [
    { value: 'scan', label: 'Skan' },
    { value: 'color', label: 'Kolor' },
    { value: 'original', label: 'Oryginał' },
];

/** Drag the 4 corners of the sheet over the photo. */
function CornerEditor({ photo, corners, onChange }) {
    const boxRef = useRef(null);
    const canvasRef = useRef(null);
    const svgRef = useRef(null);
    const dragging = useRef(-1);
    const [size, setSize] = useState(null);

    // Fit the photo into the available area, keeping its aspect ratio
    useEffect(() => {
        const box = boxRef.current;
        const fit = () => {
            const { width, height } = box.getBoundingClientRect();
            const scale = Math.min(width / photo.width, height / photo.height);
            setSize({ width: Math.floor(photo.width * scale), height: Math.floor(photo.height * scale) });
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(box);
        return () => observer.disconnect();
    }, [photo]);

    useEffect(() => {
        const canvas = canvasRef.current;
        canvas.width = photo.width;
        canvas.height = photo.height;
        canvas.getContext('2d').drawImage(photo, 0, 0);
    }, [photo]);

    const toPhoto = (event) => {
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: Math.min(photo.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * photo.width)),
            y: Math.min(photo.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * photo.height)),
        };
    };

    const onPointerDown = (index) => (event) => {
        event.preventDefault();
        dragging.current = index;
        svgRef.current.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
        if (dragging.current < 0) return;
        const point = toPhoto(event);
        onChange(corners.map((c, i) => (i === dragging.current ? point : c)));
    };
    const onPointerUp = () => {
        dragging.current = -1;
    };

    const r = Math.max(photo.width, photo.height) * 0.022;
    const points = corners.map((c) => `${c.x},${c.y}`).join(' ');

    return (
        <div ref={boxRef} className="w-full h-full flex items-center justify-center">
        <div className="relative" style={size || { visibility: 'hidden' }}>
            <canvas ref={canvasRef} className="block w-full h-full" />
            <svg
                ref={svgRef}
                viewBox={`0 0 ${photo.width} ${photo.height}`}
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full touch-none"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <defs>
                    <mask id="sheet-mask">
                        <rect width={photo.width} height={photo.height} fill="white" />
                        <polygon points={points} fill="black" />
                    </mask>
                </defs>
                <rect width={photo.width} height={photo.height} fill="rgba(0,0,0,0.45)" mask="url(#sheet-mask)" />
                <polygon points={points} fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth={r * 0.25} />
                {corners.map((c, i) => (
                    <g key={i} onPointerDown={onPointerDown(i)} style={{ cursor: 'grab' }}>
                        <circle cx={c.x} cy={c.y} r={r * 2.4} fill="transparent" />
                        <circle cx={c.x} cy={c.y} r={r} fill="white" stroke="#3b82f6" strokeWidth={r * 0.3} />
                    </g>
                ))}
            </svg>
        </div>
        </div>
    );
}

/**
 * Full-screen document scanner. Starts from a photo taken by the parent (so the
 * camera opens on the user's tap), lets the user fix the corners, pick a filter
 * and add more pages. onDone(pages: HTMLCanvasElement[]).
 */
export default function DocumentScanner({ initialPhoto, onCancel, onDone }) {
    const cameraRef = useRef(null);
    const [pages, setPages] = useState([]); // { canvas, url }
    const [photo, setPhoto] = useState(null); // canvas of the current photo
    const [corners, setCorners] = useState(null);
    const [warped, setWarped] = useState(null); // straightened page before filter
    const [filter, setFilter] = useState('scan');
    const [preview, setPreview] = useState(null); // { canvas, url }
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const openPhoto = useCallback(async (file) => {
        setError('');
        setBusy('Szukam kartki…');
        try {
            const canvas = await loadPhoto(file);
            // let the spinner paint before the heavy work
            await new Promise((resolve) => setTimeout(resolve, 30));
            setPhoto(canvas);
            setCorners(detectCorners(canvas));
            setWarped(null);
            setPreview(null);
        } catch (err) {
            setError(err.message || 'Nie udało się otworzyć zdjęcia');
        } finally {
            setBusy('');
        }
    }, []);

    useEffect(() => {
        if (initialPhoto) openPhoto(initialPhoto);
    }, [initialPhoto, openPhoto]);

    // Filter preview of the straightened page
    useEffect(() => {
        if (!warped) return undefined;
        const canvas = enhance(warped, filter);
        const url = canvas.toDataURL('image/jpeg', 0.7);
        setPreview({ canvas, url });
        return undefined;
    }, [warped, filter]);

    const straighten = async () => {
        setBusy('Prostuję stronę…');
        await new Promise((resolve) => setTimeout(resolve, 30));
        try {
            setWarped(warpPerspective(photo, corners));
        } finally {
            setBusy('');
        }
    };

    const rotate = () => setWarped((w) => (w ? rotateCanvas(w) : w));

    const keepPage = () => {
        setPages((prev) => [...prev, { canvas: preview.canvas, url: preview.url }]);
        setPhoto(null);
        setCorners(null);
        setWarped(null);
        setPreview(null);
    };

    const takePhoto = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) openPhoto(file);
    };

    const stage = warped ? 'preview' : photo ? 'crop' : 'pages';

    return (
        <div className="fixed inset-0 z-[95] bg-neutral-950 text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-3 h-14 shrink-0">
                <button type="button" onClick={onCancel} className="p-2 rounded-full hover:bg-white/10" aria-label="Zamknij skaner">
                    <X size={22} />
                </button>
                <div className="text-sm font-semibold">
                    {stage === 'crop' ? 'Dopasuj rogi kartki' : stage === 'preview' ? 'Podgląd strony' : `Skan · ${pages.length} ${pages.length === 1 ? 'strona' : pages.length < 5 ? 'strony' : 'stron'}`}
                </div>
                <div className="w-10" />
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center p-3 overflow-hidden">
                {busy ? (
                    <div className="flex flex-col items-center gap-3 text-white/80">
                        <Loader2 size={30} className="animate-spin" />
                        <span className="text-sm">{busy}</span>
                    </div>
                ) : stage === 'crop' ? (
                    <CornerEditor photo={photo} corners={corners} onChange={setCorners} />
                ) : stage === 'preview' && preview ? (
                    <img src={preview.url} alt="Podgląd strony" className="max-w-full max-h-full object-contain bg-white shadow-2xl" />
                ) : pages.length === 0 ? (
                    <div className="text-center text-white/70 max-w-xs">
                        <Camera size={40} className="mx-auto mb-3" />
                        <p className="text-sm">{error || 'Zrób zdjęcie pierwszej strony. Połóż kartkę na ciemniejszym tle — łatwiej ją wtedy wykryć.'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-3 w-full max-w-md self-start overflow-y-auto max-h-full">
                        {pages.map((page, i) => (
                            <div key={i} className="relative">
                                <img src={page.url} alt={`Strona ${i + 1}`} className="w-full aspect-[3/4] object-cover bg-white rounded-lg" />
                                <span className="absolute left-1.5 bottom-1.5 text-[11px] font-bold bg-black/70 rounded px-1.5">{i + 1}</span>
                                <button
                                    type="button"
                                    onClick={() => setPages((prev) => prev.filter((_, j) => j !== i))}
                                    className="absolute right-1 top-1 p-1.5 rounded-full bg-black/70 hover:bg-red-600"
                                    aria-label={`Usuń stronę ${i + 1}`}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => cameraRef.current?.click()}
                            className="aspect-[3/4] rounded-lg border-2 border-dashed border-white/30 flex flex-col items-center justify-center gap-1 text-white/70 hover:border-white/60"
                        >
                            <Plus size={22} />
                            <span className="text-xs font-semibold">Strona</span>
                        </button>
                    </div>
                )}
            </div>

            {error && stage !== 'pages' && <div className="mx-4 mb-2 text-sm text-red-300">{error}</div>}

            <div className="shrink-0 px-4 pb-4 pt-2">
                {stage === 'crop' && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setCorners(defaultCorners(photo.width, photo.height, 0))} className="flex-1 btn !bg-white/10 !text-white !border-0">
                            <Crop size={17} /> Całe zdjęcie
                        </button>
                        <button type="button" onClick={straighten} disabled={Boolean(busy)} className="flex-1 btn btn-primary">
                            <Check size={17} /> Dalej
                        </button>
                    </div>
                )}
                {stage === 'preview' && (
                    <div className="space-y-3">
                        <div className="flex justify-center gap-1.5">
                            {FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    type="button"
                                    onClick={() => setFilter(f.value)}
                                    className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ${filter === f.value ? 'bg-white text-neutral-900' : 'bg-white/10 text-white'}`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setWarped(null)} className="btn !bg-white/10 !text-white !border-0" aria-label="Popraw rogi">
                                <Crop size={17} />
                            </button>
                            <button type="button" onClick={rotate} className="btn !bg-white/10 !text-white !border-0" aria-label="Obróć">
                                <RotateCw size={17} />
                            </button>
                            <button type="button" onClick={keepPage} disabled={!preview} className="flex-1 btn btn-primary">
                                <Check size={17} /> Zachowaj stronę
                            </button>
                        </div>
                    </div>
                )}
                {stage === 'pages' && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => cameraRef.current?.click()} className="flex-1 btn !bg-white/10 !text-white !border-0">
                            <Camera size={17} /> {pages.length ? 'Kolejna strona' : 'Zrób zdjęcie'}
                        </button>
                        {pages.length > 0 && (
                            <button type="button" onClick={() => onDone(pages.map((p) => p.canvas))} className="flex-1 btn btn-primary">
                                <Check size={17} /> Zapisz PDF
                            </button>
                        )}
                    </div>
                )}
            </div>

            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={takePhoto} className="hidden" />
        </div>
    );
}
