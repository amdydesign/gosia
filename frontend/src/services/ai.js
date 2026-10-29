import { apiRequest } from '../utils/api';
import { isPdf, prepareImagesForAi } from '../utils/images';
import { extractPdfText } from '../utils/pdfText';

const MAX_TEXT = 60000;

/**
 * Read screenshots / PDFs with AI on the server.
 * mode: "purchase" | "collaboration" | "insights"
 * A PDF with a text layer (a brief, a contract) goes as text - every page, not just the first few
 * as pictures; a scanned PDF (no text) is sent as page images.
 */
export async function readScreens(mode, files) {
    const pictures = [];
    const texts = [];
    for (const file of files) {
        if (mode === 'collaboration' && isPdf(file)) {
            const text = await extractPdfText(file).catch(() => '');
            if (text.replace(/\s+/g, '').length > 200) {
                texts.push(`--- ${file.name} ---\n${text}`);
                continue;
            }
        }
        pictures.push(file);
    }
    const images = pictures.length ? await prepareImagesForAi(pictures) : [];
    const text = texts.join('\n\n').slice(0, MAX_TEXT);
    if (!images.length && !text) throw new Error('Nie znaleziono obrazu ani tekstu do odczytania.');
    return apiRequest('/ai/parse.php', 'POST', { mode, images, ...(text ? { text } : {}) });
}
