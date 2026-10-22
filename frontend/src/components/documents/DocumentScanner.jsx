import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, RotateCw, Check, Trash2, Crop, Loader2, Zap, ZapOff, Images } from 'lucide-react';
import { loadPhoto, detectCorners, defaultCorners, warpPerspective, enhance, rotateCanvas, grabFrame } from '../../utils/scanner';

const FILTERS = [
    { value: 'color', label: 'Kolor' },
    { value: 'scan', label: 'Szary' },
    { value: 'original', label: 'Oryginał' },
];

const DETECT_EVERY_MS = 160;
const STABLE_FRAMES = 6; // ~1 s without movement -> auto capture

const pagesLabel = (n) => `${n} ${n === 1 ? 'strona' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'strony' : 'stron'}`;
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30));

/** Drag the 4 corners of the sheet over the photo (manual correction). */
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
 * Live camera like iOS "Scan document": the sheet is outlined in real time and
 * captured automatically once it holds still. Falls back to the system camera
 * when live video is not available.
 */
function LiveCamera({ auto, onCapture, onFallback }) {
    const videoRef = useRef(null);
    const [quad, setQuad] = useState(null);
    const [dims, setDims] = useState(null);
    const [stable, setStable] = useState(0);
    const [failed, setFailed] = useState('');
    const quadRef = useRef(null);
    const stableRef = useRef(0);
    const capturingRef = useRef(false);

    const capture = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || capturingRef.current) return;
        capturingRef.current = true;
        const frame = grabFrame(video);
        const quad = quadRef.current;
        // Android/Chrome can take a full-resolution still photo; the corners are
        // found again on it (or scaled from the video when that fails)
        const track = video.srcObject?.getVideoTracks?.()[0];
        if (typeof window.ImageCapture === 'function' && track) {
            try {
                const photo = await loadPhoto(await new window.ImageCapture(track).takePhoto());
                const scale = photo.width / frame.width;
                const sameShape = Math.abs(photo.width / photo.height - frame.width / frame.height) < 0.05;
                const found = detectCorners(photo, { fallback: false }) || (quad && sameShape ? quad.map((c) => ({ x: c.x * scale, y: c.y * scale })) : null);
                onCapture(photo, found);
                return;
            } catch {
                // fall back to the video frame
            }
        }
        onCapture(frame, quad);
    }, [onCapture]);

    useEffect(() => {
        let stream = null;
        let timer = null;
        let cancelled = false;

        (async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setFailed('Ta przeglądarka nie daje dostępu do podglądu kamery.');
                return;
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
                });
            } catch {
                if (!cancelled) setFailed('Brak dostępu do kamery. Zezwól na kamerę w ustawieniach przeglądarki albo użyj zwykłego aparatu.');
                return;
            }
            if (cancelled) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            const video = videoRef.current;
            video.srcObject = stream;
            await video.play().catch(() => {});
            let shownW = video.videoWidth;
            setDims({ width: video.videoWidth, height: video.videoHeight });

            timer = setInterval(() => {
                if (!video.videoWidth || capturingRef.current) return;
                if (video.videoWidth !== shownW) {
                    shownW = video.videoWidth;
                    setDims({ width: video.videoWidth, height: video.videoHeight });
                }
                const found = detectCorners(video, { fallback: false });
                const prev = quadRef.current;
                const diag = Math.hypot(video.videoWidth, video.videoHeight);
                const still = found && prev && found.every((c, i) => Math.hypot(c.x - prev[i].x, c.y - prev[i].y) < diag * 0.02);
                stableRef.current = found ? (still ? stableRef.current + 1 : 1) : 0;
                // smooth the outline between frames so it does not jitter
                const shown = found && still ? found.map((c, i) => ({ x: (c.x + prev[i].x) / 2, y: (c.y + prev[i].y) / 2 })) : found;
                quadRef.current = shown;
                setQuad(shown);
                setStable(stableRef.current);
            }, DETECT_EVERY_MS);
        })();

        return () => {
            cancelled = true;
            clearInterval(timer);
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    useEffect(() => {
        if (auto && stable >= STABLE_FRAMES) capture();
    }, [auto, stable, capture]);

    if (failed) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center text-white/80 px-8 gap-4">
                <Camera size={40} />
                <p className="text-sm">{failed}</p>
                <button type="button" onClick={onFallback} className="btn btn-primary">
                    <Camera size={17} /> Zrób zdjęcie aparatem
                </button>
            </div>
        );
    }

    const progress = Math.min(1, stable / STABLE_FRAMES);
    return (
        <div className="relative w-full h-full">
            <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-contain" />
            {dims && (
                <svg viewBox={`0 0 ${dims.width} ${dims.height}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none">
                    {quad && (
                        <polygon
                            points={quad.map((c) => `${c.x},${c.y}`).join(' ')}
                            fill={`rgba(59,130,246,${0.15 + progress * 0.25})`}
                            stroke="#60a5fa"
                            strokeWidth={Math.max(dims.width, dims.height) * 0.005}
                            strokeLinejoin="round"
                        />
                    )}
                </svg>
            )}
            <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none">
                <span className="px-3 py-1.5 rounded-full bg-black/60 text-sm font-semibold">
                    {!dims ? 'Uruchamiam kamerę…' : !quad ? 'Szukam dokumentu…' : auto ? (progress < 1 ? 'Trzymaj nieruchomo…' : 'Robię skan…') : 'Dokument znaleziony'}
                </span>
            </div>
            <button
                type="button"
                onClick={capture}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Zrób skan"
            >
                <span className="w-[56px] h-[56px] rounded-full bg-white" />
            </button>
        </div>
    );
}

/**
 * Full-screen document scanner. Pages are captured from the live camera (auto
 * or with the shutter), straightened and cleaned up automatically, then the
 * scanner returns to the camera for the next page. onDone(pages: HTMLCanvasElement[]).
 */
export default function DocumentScanner({ onCancel, onDone }) {
    const fallbackRef = useRef(null);
    const [stage, setStage] = useState('camera'); // camera | crop | preview | pages
    const [auto, setAuto] = useState(true);
    const [pages, setPages] = useState([]); // { canvas, url }
    const [photo, setPhoto] = useState(null);
    const [corners, setCorners] = useState(null);
    const [warped, setWarped] = useState(null);
    const [filter, setFilter] = useState('color');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState('');
    const [cameraKey, setCameraKey] = useState(0);

    // Straighten + clean up straight away; only ask for corners when the sheet was not found
    const process = useCallback(async (frame, found) => {
        setBusy('Prostuję stronę…');
        await nextFrame();
        try {
            const sheet = found || detectCorners(frame, { fallback: false });
            setPhoto(frame);
            if (sheet) {
                setCorners(sheet);
                setWarped(warpPerspective(frame, sheet));
                setStage('preview');
            } else {
                setCorners(defaultCorners(frame.width, frame.height));
                setStage('crop');
            }
        } finally {
            setBusy('');
        }
    }, []);

    const onFallbackPhoto = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setBusy('Szukam kartki…');
        try {
            process(await loadPhoto(file), null);
        } catch {
            setBusy('');
        }
    };

    useEffect(() => {
        if (!warped) return;
        const canvas = enhance(warped, filter);
        setPreview({ canvas, url: canvas.toDataURL('image/jpeg', 0.75) });
    }, [warped, filter]);

    const applyCorners = async () => {
        setBusy('Prostuję stronę…');
        await nextFrame();
        try {
            setWarped(warpPerspective(photo, corners));
            setStage('preview');
        } finally {
            setBusy('');
        }
    };

    const backToCamera = () => {
        setPhoto(null);
        setCorners(null);
        setWarped(null);
        setPreview(null);
        setCameraKey((k) => k + 1);
        setStage('camera');
    };

    const keepPage = () => {
        setPages((prev) => [...prev, { canvas: preview.canvas, url: preview.url }]);
        backToCamera();
    };

    const finish = () => onDone(pages.map((p) => p.canvas));
    const title = stage === 'crop' ? 'Dopasuj rogi kartki' : stage === 'preview' ? `Strona ${pages.length + 1}` : stage === 'pages' ? pagesLabel(pages.length) : 'Skanuj dokument';

    return (
        <div className="fixed inset-0 z-[95] bg-neutral-950 text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-3 h-14 shrink-0">
                <button type="button" onClick={onCancel} className="p-2 rounded-full hover:bg-white/10" aria-label="Zamknij skaner">
                    <X size={22} />
                </button>
                <div className="text-sm font-semibold">{title}</div>
                {stage === 'camera' ? (
                    <button type="button" onClick={() => setAuto((a) => !a)} className={`px-2.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${auto ? 'bg-amber-400 text-neutral-900' : 'bg-white/10'}`}>
                        {auto ? <Zap size={13} /> : <ZapOff size={13} />} {auto ? 'Auto' : 'Ręcznie'}
                    </button>
                ) : (
                    <div className="w-10" />
                )}
            </div>

            <div className="flex-1 min-h-0 relative overflow-hidden">
                {busy && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/80">
                        <Loader2 size={30} className="animate-spin" />
                        <span className="text-sm">{busy}</span>
                    </div>
                )}
                {stage === 'camera' && <LiveCamera key={cameraKey} auto={auto} onCapture={process} onFallback={() => fallbackRef.current?.click()} />}
                {stage === 'crop' && photo && (
                    <div className="h-full p-3">
                        <CornerEditor photo={photo} corners={corners} onChange={setCorners} />
                    </div>
                )}
                {stage === 'preview' && preview && (
                    <div className="h-full p-3 flex items-center justify-center">
                        <img src={preview.url} alt="Podgląd strony" className="max-w-full max-h-full object-contain bg-white shadow-2xl" />
                    </div>
                )}
                {stage === 'pages' && (
                    <div className="h-full overflow-y-auto p-4">
                        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
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
                        </div>
                    </div>
                )}
            </div>

            <div className="shrink-0 px-4 pb-4 pt-3">
                {stage === 'camera' && (
                    <div className="flex items-center justify-between gap-3 min-h-[44px]">
                        <button
                            type="button"
                            onClick={() => pages.length && setStage('pages')}
                            className={`relative w-12 h-12 rounded-lg overflow-hidden border border-white/30 ${pages.length ? '' : 'opacity-0 pointer-events-none'}`}
                            aria-label="Zeskanowane strony"
                        >
                            {pages.length > 0 && <img src={pages[pages.length - 1].url} alt="" className="w-full h-full object-cover bg-white" />}
                            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-primary-600 text-[11px] font-bold flex items-center justify-center">{pages.length}</span>
                        </button>
                        <span className="text-xs text-white/60 text-center">{auto ? 'Skan zrobi się sam' : 'Naciśnij spust'}</span>
                        <button type="button" onClick={finish} disabled={!pages.length} className="btn btn-primary !px-4 disabled:opacity-0">
                            Zapisz
                        </button>
                    </div>
                )}
                {stage === 'crop' && (
                    <div className="flex gap-2">
                        <button type="button" onClick={backToCamera} className="flex-1 btn !bg-white/10 !text-white !border-0">
                            <Camera size={17} /> Ponów
                        </button>
                        <button type="button" onClick={applyCorners} className="flex-1 btn btn-primary">
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
                            <button type="button" onClick={backToCamera} className="btn !bg-white/10 !text-white !border-0" aria-label="Ponów zdjęcie">
                                <Camera size={17} />
                            </button>
                            <button type="button" onClick={() => setStage('crop')} className="btn !bg-white/10 !text-white !border-0" aria-label="Popraw rogi">
                                <Crop size={17} />
                            </button>
                            <button type="button" onClick={() => setWarped((w) => rotateCanvas(w))} className="btn !bg-white/10 !text-white !border-0" aria-label="Obróć">
                                <RotateCw size={17} />
                            </button>
                            <button type="button" onClick={keepPage} disabled={!preview} className="flex-1 btn btn-primary">
                                <Check size={17} /> Zachowaj
                            </button>
                        </div>
                    </div>
                )}
                {stage === 'pages' && (
                    <div className="flex gap-2">
                        <button type="button" onClick={backToCamera} className="flex-1 btn !bg-white/10 !text-white !border-0">
                            <Images size={17} /> Kolejna strona
                        </button>
                        <button type="button" onClick={finish} disabled={!pages.length} className="flex-1 btn btn-primary">
                            <Check size={17} /> Zapisz PDF
                        </button>
                    </div>
                )}
            </div>

            <input ref={fallbackRef} type="file" accept="image/*" capture="environment" onChange={onFallbackPhoto} className="hidden" />
        </div>
    );
}
