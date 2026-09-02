import { matchPath } from 'react-router-dom';

const ROUTES = [
    { pattern: '/collaborations/new', title: 'Nowa współpraca', back: '/collaborations' },
    { pattern: '/collaborations/:id/edit', title: 'Edycja współpracy', back: (p) => `/collaborations/${p.id}` },
    { pattern: '/collaborations/:id', title: 'Współpraca', back: '/collaborations' },
    { pattern: '/collaborations', title: 'Współprace', subtitle: 'Zlecenia, rozliczenia i płatności', root: true, section: 'collaborations' },
    { pattern: '/purchases/new', title: 'Nowy zakup', back: '/purchases' },
    { pattern: '/purchases/:id/edit', title: 'Edycja zakupu', back: (p) => `/purchases/${p.id}` },
    { pattern: '/purchases/:id', title: 'Zakup', back: '/purchases' },
    { pattern: '/purchases', title: 'Zakupy i zwroty', subtitle: 'Pilnuj terminów zwrotów', root: true, section: 'purchases' },
    { pattern: '/ideas/new', title: 'Nowy pomysł', back: '/ideas' },
    { pattern: '/ideas/:id/edit', title: 'Edycja pomysłu', back: (p) => `/ideas/${p.id}` },
    { pattern: '/ideas/:id', title: 'Pomysł', back: '/ideas' },
    { pattern: '/ideas', title: 'Pomysły na rolki', subtitle: 'Scenariusze i prompter', root: true, section: 'ideas' },
    { pattern: '/statistics', title: 'Statystyki', subtitle: 'Finanse, PIT i social media', root: true, section: 'statistics' },
    { pattern: '/dashboard', title: 'Start', root: true, section: 'dashboard' },
    { pattern: '/', title: 'Start', root: true, section: 'dashboard' },
];

export function getRouteMeta(pathname) {
    for (const route of ROUTES) {
        const match = matchPath({ path: route.pattern, end: true }, pathname);
        if (match) {
            const back = typeof route.back === 'function' ? route.back(match.params) : route.back;
            return { ...route, back, params: match.params };
        }
    }
    return { title: 'Gosia', root: true };
}
