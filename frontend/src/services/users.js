/**
 * Accounts (admin) and your own profile.
 */
import { apiRequest } from '../utils/api';

export function listUsers() {
    return apiRequest('/users/index.php');
}

export function createUser({ display_name, username, password }) {
    return apiRequest('/users/index.php', 'POST', { display_name, username, password });
}

/** patch: { display_name?, password?, is_active? } */
export function updateUser(id, patch) {
    return apiRequest(`/users/update.php?id=${id}`, 'PUT', patch);
}

export function updateProfile(displayName) {
    return apiRequest('/auth/profile.php', 'PUT', { display_name: displayName });
}

/** patch: { display_name?, email? } */
export function updateProfileFields(patch) {
    return apiRequest('/auth/profile.php', 'PUT', patch);
}

export function fetchMe() {
    return apiRequest('/auth/verify.php');
}

/** Easy-to-type password to pass on: e.g. "kawa-mewa-4821". */
export function suggestPassword() {
    const words = ['kawa', 'mewa', 'lato', 'zima', 'kot', 'las', 'rower', 'jesien', 'moda', 'paski', 'buty', 'kropka'];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}
