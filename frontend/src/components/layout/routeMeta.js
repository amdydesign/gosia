import { matchPath } from 'react-router-dom';

const ROUTES = [
    // Details open as sheets over the list - the list stays the "page"
    { pattern: '/collaborations/*', title: 'Współprace', root: true, section: 'collaborations' },
    { pattern: '/collaborations', title: 'Współprace', root: true, section: 'collaborations' },
    { pattern: '/purchases/*', title: 'Zakupy i zwroty', root: true, section: 'purchases' },
    { pattern: '/purchases', title: 'Zakupy i zwroty', root: true, section: 'purchases' },
    { pattern: '/ideas/new', title: 'Nowy pomysł', back: '/ideas' },
    { pattern: '/ideas/:id/edit', title: 'Edycja pomysłu', back: (p) => `/ideas/${p.id}` },
    { pattern: '/ideas/:id', title: 'Pomysł', back: '/ideas' },
    { pattern: '/ideas', title: 'Pomysły na rolki', subtitle: 'Scenariusze i prompter', root: true, section: 'ideas' },
    { pattern: '/documents', title: 'Dokumenty', subtitle: 'Umowy i dokumenty poufne', root: true, section: 'documents' },
    { pattern: '/statistics', title: 'Statystyki', root: true, section: 'statistics' },
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
    return { title: 'Gonia', root: true };
}
