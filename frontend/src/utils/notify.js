/**
 * Toasts from places outside React (upload queues, lazy-loaded engines).
 * ToastProvider plugs itself in; before that (or in tests) calls are ignored.
 */
let api = null;

export function setToastApi(next) {
    api = next;
}

export const notify = {
    success: (msg, opts) => api?.success(msg, opts),
    error: (msg, opts) => api?.error(msg, opts),
    info: (msg, opts) => api?.info(msg, opts),
};
