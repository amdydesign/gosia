/**
 * Cover frame for a shared file, made on the device (the hosting has no ffmpeg):
 * a frame from ~1 s into a video, or a smaller copy of a photo. JPEG Blob or null.
 */
const MAX_SIDE = 720;

function toJpeg(source, width, height) {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8));
}

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

function videoFrame(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        const done = (blob) => {
            URL.revokeObjectURL(url);
            video.removeAttribute('src');
            video.load();
            resolve(blob);
        };
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.onerror = () => done(null);
        video.onloadedmetadata = () => {
            video.currentTime = Math.min(1, (video.duration || 2) / 3);
        };
        video.onseeked = async () => {
            if (!video.videoWidth) return done(null);
            done(await toJpeg(video, video.videoWidth, video.videoHeight));
        };
        video.src = url;
    });
}

function photo(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            const blob = await toJpeg(img, img.naturalWidth, img.naturalHeight);
            URL.revokeObjectURL(url);
            resolve(blob);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

export async function makePoster(file) {
    const type = file.type || '';
    if (type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)) return withTimeout(videoFrame(file), 12000);
    if (type.startsWith('image/')) return withTimeout(photo(file), 8000);
    return null;
}
