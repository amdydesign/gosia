import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Minus, Plus, FlipHorizontal2, RotateCcw, Gauge } from 'lucide-react';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Fullscreen teleprompter with auto-scroll, speed, font size and mirror mode.
 * Tap anywhere on the text to play/pause.
 */
export default function Prompter({ title, content, onClose }) {
    const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('prompter.font')) || 40);
    const [speed, setSpeed] = useState(() => Number(localStorage.getItem('prompter.speed')) || 1);
    const [mirror, setMirror] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const scrollRef = useRef(null);
    const frame = useRef(null);
    const last = useRef(0);
    const accumulator = useRef(0);

    useEffect(() => {
        localStorage.setItem('prompter.font', String(fontSize));
        localStorage.setItem('prompter.speed', String(speed));
    }, [fontSize, speed]);

    // Auto-scroll loop: ~40px/s at speed 1, scaled by font size
    useEffect(() => {
        if (!playing) {
            if (frame.current) cancelAnimationFrame(frame.current);
            frame.current = null;
            return undefined;
        }
        last.current = performance.now();
        const step = (now) => {
            const el = scrollRef.current;
            if (!el) return;
            const dt = (now - last.current) / 1000;
            last.current = now;
            const pxPerSecond = 40 * speed * (fontSize / 40);
            accumulator.current += pxPerSecond * dt;
            if (accumulator.current >= 1) {
                const px = Math.floor(accumulator.current);
                el.scrollTop += px;
                accumulator.current -= px;
            }
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                setPlaying(false);
                return;
            }
            frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
        return () => frame.current && cancelAnimationFrame(frame.current);
    }, [playing, speed, fontSize]);

    // Countdown before start
    useEffect(() => {
        if (countdown === null) return undefined;
        const t = setTimeout(() => {
            if (countdown <= 1) {
                setCountdown(null);
                setPlaying(true);
            } else {
                setCountdown(countdown - 1);
            }
        }, 1000);
        return () => clearTimeout(t);
    }, [countdown]);

    const togglePlay = useCallback(() => {
        if (countdown !== null) {
            setCountdown(null);
            return;
        }
        if (playing) setPlaying(false);
        else if (scrollRef.current && scrollRef.current.scrollTop < 10) setCountdown(3);
        else setPlaying(true);
    }, [playing, countdown]);

    const restart = () => {
        setPlaying(false);
        setCountdown(null);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
            }
            if (e.key === 'ArrowUp') setFontSize((s) => Math.min(96, s + 4));
            if (e.key === 'ArrowDown') setFontSize((s) => Math.max(20, s - 4));
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, togglePlay]);

    const speedIndex = SPEEDS.indexOf(speed);
    const cycleSpeed = () => setSpeed(SPEEDS[(speedIndex + 1) % SPEEDS.length] ?? 1);

    return (
        <div className="fixed inset-0 z-[95] bg-black text-white flex flex-col select-none">
            {/* Top bar */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/80 backdrop-blur border-b border-white/10 safe-top">
                <button type="button" onClick={onClose} className="p-2 -ml-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10" aria-label="Zamknij">
                    <X size={26} />
                </button>
                <div className="flex-1 min-w-0 text-center text-xs font-semibold text-white/60 truncate">{title}</div>
                <button
                    type="button"
                    onClick={() => setMirror((m) => !m)}
                    className={`p-2 rounded-xl ${mirror ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'}`}
                    title="Odbicie lustrzane (do szkła promptera)"
                    aria-label="Odbicie lustrzane"
                >
                    <FlipHorizontal2 size={22} />
                </button>
            </div>

            {/* Text */}
            <div
                ref={scrollRef}
                onClick={togglePlay}
                className="flex-1 overflow-y-auto no-scrollbar relative"
                style={{ transform: mirror ? 'scaleX(-1)' : 'none' }}
            >
                <div className="pointer-events-none sticky top-0 h-24 bg-gradient-to-b from-black to-transparent z-10" />
                <div
                    className="px-6 sm:px-12 max-w-4xl mx-auto whitespace-pre-wrap font-semibold leading-[1.45] tracking-tight text-center"
                    style={{ fontSize: `${fontSize}px`, paddingTop: '20vh', paddingBottom: '70vh' }}
                >
                    {content || 'Brak treści scenariusza.'}
                </div>
                <div className="pointer-events-none sticky bottom-0 h-32 bg-gradient-to-t from-black to-transparent z-10" />
            </div>

            {/* Reading line */}
            <div className="pointer-events-none absolute left-0 right-0 top-[38%] h-px bg-primary-500/60" />

            {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 pointer-events-none">
                    <div key={countdown} className="text-[120px] font-extrabold text-white animate-scale-in">{countdown}</div>
                </div>
            )}

            {/* Controls */}
            <div className="bg-black/85 backdrop-blur border-t border-white/10 px-4 py-3 safe-bottom">
                <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
                        <button type="button" onClick={() => setFontSize((s) => Math.max(20, s - 4))} className="p-2 rounded-lg hover:bg-white/10" aria-label="Mniejsza czcionka">
                            <Minus size={18} />
                        </button>
                        <span className="text-xs font-bold w-8 text-center tabular-nums">{fontSize}</span>
                        <button type="button" onClick={() => setFontSize((s) => Math.min(96, s + 4))} className="p-2 rounded-lg hover:bg-white/10" aria-label="Większa czcionka">
                            <Plus size={18} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-full bg-primary-600 hover:bg-primary-500 text-white flex items-center justify-center shadow-float active:scale-95 transition-transform"
                        aria-label={playing ? 'Pauza' : 'Start'}
                    >
                        {playing || countdown !== null ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>

                    <div className="flex items-center gap-1">
                        <button type="button" onClick={cycleSpeed} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-xl px-3 py-2.5 text-xs font-bold tabular-nums" title="Prędkość przewijania">
                            <Gauge size={16} /> {speed}×
                        </button>
                        <button type="button" onClick={restart} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15" aria-label="Od początku" title="Od początku">
                            <RotateCcw size={18} />
                        </button>
                    </div>
                </div>
                <p className="text-center text-[10px] text-white/40 mt-2 hidden sm:block">Spacja — start/pauza · ↑↓ — rozmiar tekstu · Esc — zamknij</p>
            </div>
        </div>
    );
}
