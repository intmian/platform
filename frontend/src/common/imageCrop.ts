export async function cropImageToAspectRatio(
    file: File,
    aspectWidth: number = 3,
    aspectHeight: number = 4,
    quality: number = 0.92
): Promise<File | null> {
    const imageUrl = URL.createObjectURL(file);

    try {
        const image = await loadImage(imageUrl);
        const cropResult = await openInteractiveCropModal(image, aspectWidth, aspectHeight);
        if (!cropResult) {
            return null;
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

        const scaleX = outputWidth / cropResult.frameWidth;
        const scaleY = outputHeight / cropResult.frameHeight;
        const drawWidth = cropResult.displayWidth * scaleX;
        const drawHeight = cropResult.displayHeight * scaleY;
        const drawX = cropResult.left * scaleX;
        const drawY = cropResult.top * scaleY;

        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

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

interface CropModalResult {
    frameWidth: number;
    frameHeight: number;
    left: number;
    top: number;
    displayWidth: number;
    displayHeight: number;
}

function openInteractiveCropModal(
    image: HTMLImageElement,
    aspectWidth: number,
    aspectHeight: number
): Promise<CropModalResult | null> {
    return new Promise((resolve) => {
        const viewportMaxHeight = Math.min(window.innerHeight - 220, 560);
        const frameHeight = Math.max(280, viewportMaxHeight);
        const frameWidth = Math.round(frameHeight * (aspectWidth / aspectHeight));

        const baseFitScale = Math.max(frameWidth / image.width, frameHeight / image.height);
        let zoom = 1;
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        const backdrop = document.createElement('div');
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.background = 'rgba(0,0,0,0.45)';
        backdrop.style.display = 'flex';
        backdrop.style.alignItems = 'center';
        backdrop.style.justifyContent = 'center';
        backdrop.style.zIndex = '1200';

        const panel = document.createElement('div');
        panel.style.background = '#fff';
        panel.style.borderRadius = '10px';
        panel.style.padding = '16px';
        panel.style.maxWidth = '92vw';
        panel.style.maxHeight = '90vh';
        panel.style.overflow = 'auto';
        panel.style.boxSizing = 'border-box';

        const title = document.createElement('div');
        title.textContent = '裁剪封面（3:4）';
        title.style.fontSize = '16px';
        title.style.fontWeight = '600';
        title.style.marginBottom = '12px';

        const frame = document.createElement('div');
        frame.style.position = 'relative';
        frame.style.width = `${frameWidth}px`;
        frame.style.height = `${frameHeight}px`;
        frame.style.maxWidth = '84vw';
        frame.style.maxHeight = '58vh';
        frame.style.background = '#111';
        frame.style.overflow = 'hidden';
        frame.style.borderRadius = '8px';
        frame.style.cursor = 'grab';
        frame.style.touchAction = 'none';

        const previewImage = document.createElement('img');
        previewImage.src = image.src;
        previewImage.style.position = 'absolute';
        previewImage.style.userSelect = 'none';
        previewImage.style.pointerEvents = 'none';
        previewImage.draggable = false;

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '10px';
        controls.style.marginTop = '12px';

        const zoomLabel = document.createElement('span');
        zoomLabel.textContent = '缩放';
        zoomLabel.style.color = '#666';
        zoomLabel.style.fontSize = '13px';

        const zoomInput = document.createElement('input');
        zoomInput.type = 'range';
        zoomInput.min = '1';
        zoomInput.max = '3';
        zoomInput.step = '0.01';
        zoomInput.value = '1';
        zoomInput.style.flex = '1';

        const resetButton = document.createElement('button');
        resetButton.textContent = '重置';
        resetButton.style.border = '1px solid #d9d9d9';
        resetButton.style.background = '#fff';
        resetButton.style.borderRadius = '6px';
        resetButton.style.height = '30px';
        resetButton.style.padding = '0 12px';
        resetButton.style.cursor = 'pointer';

        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '8px';
        footer.style.marginTop = '14px';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.border = '1px solid #d9d9d9';
        cancelButton.style.background = '#fff';
        cancelButton.style.borderRadius = '6px';
        cancelButton.style.height = '32px';
        cancelButton.style.padding = '0 16px';
        cancelButton.style.cursor = 'pointer';

        const okButton = document.createElement('button');
        okButton.textContent = '确定';
        okButton.style.border = 'none';
        okButton.style.background = '#1677ff';
        okButton.style.color = '#fff';
        okButton.style.borderRadius = '6px';
        okButton.style.height = '32px';
        okButton.style.padding = '0 16px';
        okButton.style.cursor = 'pointer';

        const clampOffset = () => {
            const displayWidth = image.width * baseFitScale * zoom;
            const displayHeight = image.height * baseFitScale * zoom;
            const maxOffsetX = Math.max(0, (displayWidth - frameWidth) / 2);
            const maxOffsetY = Math.max(0, (displayHeight - frameHeight) / 2);
            offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
            offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));
        };

        const applyPreview = () => {
            clampOffset();
            const displayWidth = image.width * baseFitScale * zoom;
            const displayHeight = image.height * baseFitScale * zoom;
            const left = (frameWidth - displayWidth) / 2 + offsetX;
            const top = (frameHeight - displayHeight) / 2 + offsetY;
            previewImage.style.left = `${left}px`;
            previewImage.style.top = `${top}px`;
            previewImage.style.width = `${displayWidth}px`;
            previewImage.style.height = `${displayHeight}px`;
        };

        const cleanup = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEndDrag);
            document.removeEventListener('keydown', onKeyDown);
            backdrop.remove();
        };

        const buildResult = (): CropModalResult => {
            const displayWidth = image.width * baseFitScale * zoom;
            const displayHeight = image.height * baseFitScale * zoom;
            return {
                frameWidth,
                frameHeight,
                displayWidth,
                displayHeight,
                left: (frameWidth - displayWidth) / 2 + offsetX,
                top: (frameHeight - displayHeight) / 2 + offsetY,
            };
        };

        const onEndDrag = () => {
            dragging = false;
            frame.style.cursor = 'grab';
        };

        const onMove = (event: MouseEvent) => {
            if (!dragging) {
                return;
            }
            const nextX = event.clientX;
            const nextY = event.clientY;
            offsetX += nextX - dragStartX;
            offsetY += nextY - dragStartY;
            dragStartX = nextX;
            dragStartY = nextY;
            applyPreview();
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        };

        frame.addEventListener('mousedown', (event) => {
            event.preventDefault();
            dragging = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            frame.style.cursor = 'grabbing';
        });

        zoomInput.addEventListener('input', () => {
            zoom = Number(zoomInput.value);
            applyPreview();
        });

        resetButton.addEventListener('click', () => {
            zoom = 1;
            offsetX = 0;
            offsetY = 0;
            zoomInput.value = '1';
            applyPreview();
        });

        cancelButton.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        okButton.addEventListener('click', () => {
            const result = buildResult();
            cleanup();
            resolve(result);
        });

        backdrop.addEventListener('mousedown', (event) => {
            if (event.target === backdrop) {
                cleanup();
                resolve(null);
            }
        });

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEndDrag);
        document.addEventListener('keydown', onKeyDown);

        frame.appendChild(previewImage);
        controls.appendChild(zoomLabel);
        controls.appendChild(zoomInput);
        controls.appendChild(resetButton);
        footer.appendChild(cancelButton);
        footer.appendChild(okButton);
        panel.appendChild(title);
        panel.appendChild(frame);
        panel.appendChild(controls);
        panel.appendChild(footer);
        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        applyPreview();
    });
}
