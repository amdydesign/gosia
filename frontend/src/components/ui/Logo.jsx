/**
 * "Gonia" wordmark - the version number sits inside the lime full stop.
 */
export default function Logo({ size = 'md', className = '' }) {
    const s = size === 'lg'
        ? { text: 'text-[32px]', dot: 'h-[22px] px-[7px] text-[12px] mb-[5px]' }
        : size === 'sm'
            ? { text: 'text-[19px]', dot: 'h-4 px-[5px] text-[9.5px] mb-[3px]' }
            : { text: 'text-[23px]', dot: 'h-[18px] px-1.5 text-[10.5px] mb-1' };

    return (
        <span className={`inline-flex items-end gap-[3px] font-display font-bold tracking-[-0.03em] text-ink leading-none ${s.text} ${className}`}>
            Gonia
            <span
                className={`inline-flex items-center rounded-full bg-accent text-on-accent font-sans font-bold tracking-normal ${s.dot}`}
                aria-label="wersja 2.0"
            >
                2.0
            </span>
        </span>
    );
}
