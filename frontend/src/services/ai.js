import { apiRequest } from '../utils/api';
import { prepareImagesForAi } from '../utils/images';

/**
 * Read screenshots with AI on the server.
 * mode: "purchase" | "collaboration"
 */
export async function readScreens(mode, files) {
    const images = await prepareImagesForAi(files);
    if (!images.length) throw new Error('Nie znaleziono obrazu do odczytania.');
    return apiRequest('/ai/parse.php', 'POST', { mode, images });
}
