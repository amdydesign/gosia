/**
 * apiRequest — cienka nakładka na jedyny klient (services/api.js), zwracająca
 * rozpakowane dane (data). Zachowana dla istniejących wywołań; nowy kod
 * powinien korzystać wprost z services/api.js lub warstwy services/*.
 *
 * Parametr `token` jest ignorowany — token pobiera klient (jedno źródło).
 */

import api from '../services/api';

export const apiRequest = async (endpoint, method = 'GET', body = null) => {
    let res;
    switch (method.toUpperCase()) {
        case 'POST':
            res = await api.post(endpoint, body);
            break;
        case 'PUT':
            res = await api.put(endpoint, body);
            break;
        case 'DELETE':
            res = await api.del(endpoint);
            break;
        default:
            res = await api.get(endpoint);
    }
    // Rozpakowana koperta: zwróć data, a gdy jej brak — całą odpowiedź
    return res.data !== undefined ? res.data : res;
};

export default apiRequest;
