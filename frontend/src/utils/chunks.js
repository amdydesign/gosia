/**
 * After a deploy the old build's code-split files are gone from the server: an app that
 * stayed open cannot load them any more. Say so instead of failing silently.
 */
import { notify } from './notify';

const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|ChunkLoadError|module script|Unable to preload CSS/i;

export function isChunkError(err) {
    return CHUNK_ERROR.test(String(err?.message || err || ''));
}

export const reloadApp = () => window.location.reload();

/** "Nowa wersja" stays until she taps it - never reload on our own (she may be mid-form). */
export function announceNewVersion(message = 'Nowa wersja') {
    notify.info(message, { key: 'new-version', duration: 0, action: { label: 'Odśwież', onClick: reloadApp } });
}

/** import() of a lazy chunk; a failure (other than being offline) is reported as "new version". */
export function lazyImport(load) {
    return load().catch((err) => {
        if (navigator.onLine !== false) announceNewVersion('Jest nowa wersja — odśwież aplikację');
        throw err;
    });
}
