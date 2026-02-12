export async function cropImageToAspectRatio(
    file: File,
    aspectWidth: number = 3,
    aspectHeight: number = 4,
    quality: number = 0.92
): Promise<File> {
    const imageUrl = URL.createObjectURL(file);

    try {
        const image = await loadImage(imageUrl);
        const targetRatio = aspectWidth / aspectHeight;
        const sourceRatio = image.width / image.height;

        let sx = 0;
        let sy = 0;
        let sWidth = image.width;
        let sHeight = image.height;

        if (sourceRatio > targetRatio) {
            sHeight = image.height;
            sWidth = Math.round(sHeight * targetRatio);
            sx = Math.round((image.width - sWidth) / 2);
        } else {
            sWidth = image.width;
            sHeight = Math.round(sWidth / targetRatio);
            sy = Math.round((image.height - sHeight) / 2);
        }

        const outputWidth = 900;
        const outputHeight = Math.round((outputWidth * aspectHeight) / aspectWidth);

        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return file;
        }

        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, outputWidth, outputHeight);

        const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (!blob) {
            return file;
        }

        const nextName = normalizeFileName(file.name, mimeType);
        return new File([blob], nextName, {type: mimeType});
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
    });
}

function normalizeFileName(originalName: string, mimeType: string): string {
    const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const targetExt = extMap[mimeType] || 'jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '') || 'image';
    return `${baseName}_3x4.${targetExt}`;
}
