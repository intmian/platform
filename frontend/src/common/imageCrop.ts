export interface CropImageOptions {
    outputWidth?: number;
    quality?: number;
    avoidUpscale?: boolean;
}

export interface OversizeCoefficients {
    jpegWebp: number;
    png: number;
    other: number;
}

export interface LibraryCoverProcessOptions {
    aspectWidth?: number;
    aspectHeight?: number;
    previewWidth?: number;
    detailQuality?: number;
    previewQuality?: number;
    cropOriginalQuality?: number;
    centerCrop?: boolean;
}

export interface LibraryCoverProcessResult {
    originalFile: File;
    croppedOriginalFile: File;
    detailFile: File;
    previewFile: File;
    sourceWidth: number;
    sourceSize: number;
}

export interface OversizeRule {
    minWidth: number;
    coefficients: OversizeCoefficients;
}

export interface OversizeJudgeInput {
    imageWidth: number;
    fileSize: number;
    mimeType: string;
}

const DEFAULT_OVERSIZE_RULE: OversizeRule = {
    minWidth: 600,
    coefficients: {
        jpegWebp: 0.5,
        png: 1.3,
        other: 0.8,
    },
};

export function isImageOversizedByWidthAndBytes(
    imageWidth: number,
    fileSize: number,
    mimeType: string,
    rule: OversizeRule = DEFAULT_OVERSIZE_RULE
): boolean {
    if (imageWidth <= rule.minWidth) {
        return false;
    }

    const coeff = getOversizeCoefficient(mimeType, rule.coefficients);
    return fileSize > (imageWidth * imageWidth * coeff);
}

export async function cropImageToAspectRatio(
    file: File,
    aspectWidth: number = 2,
    aspectHeight: number = 3,
    options?: CropImageOptions
): Promise<File | null> {
    const imageUrl = URL.createObjectURL(file);

    try {
        const image = await loadImage(imageUrl);
        const cropResult = await openInteractiveCropModal(image, aspectWidth, aspectHeight);
        if (!cropResult) {
            return null;
        }
        const cropRect = buildCropRectFromModal(image, cropResult, aspectWidth, aspectHeight);

        return await renderCroppedImageFile({
            sourceFile: file,
            image,
            cropRect,
            aspectWidth,
            aspectHeight,
            outputWidth: options?.outputWidth ?? Math.max(1, Math.round(cropRect.width)),
            quality: options?.quality ?? 0.92,
            avoidUpscale: options?.avoidUpscale ?? false,
        });
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

export async function prepareLibraryCoverFiles(
    file: File,
    options?: LibraryCoverProcessOptions
): Promise<LibraryCoverProcessResult | null> {
    const aspectWidth = options?.aspectWidth ?? 2;
    const aspectHeight = options?.aspectHeight ?? 3;
    const previewWidth = options?.previewWidth ?? 480;
    const detailQuality = options?.detailQuality ?? 0.92;
    const previewQuality = options?.previewQuality ?? 0.85;
    const cropOriginalQuality = options?.cropOriginalQuality ?? 0.98;
    const sourceMimeType = normalizeMimeType(file.type);

    const imageUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(imageUrl);
        const cropRect = options?.centerCrop
            ? buildCenterCropRect(image, aspectWidth, aspectHeight)
            : await (async () => {
                const cropResult = await openInteractiveCropModal(image, aspectWidth, aspectHeight);
                if (!cropResult) {
                    return null;
                }
                return buildCropRectFromModal(image, cropResult, aspectWidth, aspectHeight);
            })();
        if (!cropRect) {
            return null;
        }

        const croppedOriginalFile = await renderCroppedImageFile({
            sourceFile: file,
            image,
            cropRect,
            aspectWidth,
            aspectHeight,
            outputWidth: Math.max(1, Math.round(cropRect.width)),
            quality: cropOriginalQuality,
            avoidUpscale: false,
            fileTag: 'crop',
            mimeTypeOverride: sourceMimeType,
        });

        const detailMimeType = sourceMimeType === 'image/png' ? 'image/jpeg' : sourceMimeType;
        const detailFile = await renderCroppedImageFile({
            sourceFile: file,
            image,
            cropRect,
            aspectWidth,
            aspectHeight,
            outputWidth: Math.max(1, Math.round(cropRect.width)),
            quality: detailQuality,
            avoidUpscale: false,
            fileTag: 'detail',
            mimeTypeOverride: detailMimeType,
        });

        const previewFile = await renderCroppedImageFile({
            sourceFile: file,
            image,
            cropRect,
            aspectWidth,
            aspectHeight,
            outputWidth: previewWidth,
            quality: previewQuality,
            avoidUpscale: true,
            fileTag: 'preview',
            mimeTypeOverride: 'image/jpeg',
        });

        return {
            originalFile: file,
            croppedOriginalFile,
            detailFile,
            previewFile,
            sourceWidth: image.width,
            sourceSize: file.size,
        };
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

export async function prepareLibraryCoverFilesFromCenterCrop(
    file: File,
    options?: LibraryCoverProcessOptions
): Promise<LibraryCoverProcessResult | null> {
    return prepareLibraryCoverFiles(file, {
        ...options,
        centerCrop: true,
    });
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

function normalizeMimeType(type?: string): string {
    if (type && type.startsWith('image/')) {
        return type;
    }
    return 'image/jpeg';
}

function getOversizeCoefficient(mimeType: string, coefficients: OversizeCoefficients): number {
    if (mimeType === 'image/png') {
        return coefficients.png;
    }
    if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
        return coefficients.jpegWebp;
    }
    return coefficients.other;
}

interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function buildCropRectFromModal(
    image: HTMLImageElement,
    cropResult: CropModalResult,
    aspectWidth: number,
    aspectHeight: number
): CropRect {
    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const displayWidth = Math.max(1, cropResult.displayWidth);
    const displayHeight = Math.max(1, cropResult.displayHeight);
    const ratio = Math.max(1e-6, aspectWidth / aspectHeight);
    const scaleX = sourceWidth / displayWidth;
    const scaleY = sourceHeight / displayHeight;

    const leftF = Math.max(0, Math.min(sourceWidth, (-cropResult.left) * scaleX));
    const topF = Math.max(0, Math.min(sourceHeight, (-cropResult.top) * scaleY));
    const rightF = Math.max(0, Math.min(sourceWidth, (cropResult.frameWidth - cropResult.left) * scaleX));
    const bottomF = Math.max(0, Math.min(sourceHeight, (cropResult.frameHeight - cropResult.top) * scaleY));

    const boxX = Math.max(0, Math.min(sourceWidth - 1, Math.floor(leftF)));
    const boxY = Math.max(0, Math.min(sourceHeight - 1, Math.floor(topF)));
    const boxWidth = Math.max(1, Math.ceil(rightF) - boxX);
    const boxHeight = Math.max(1, Math.ceil(bottomF) - boxY);

    const maxCropWidthByBox = Math.max(1, Math.min(boxWidth, Math.floor(boxHeight * ratio)));
    const maxCropWidthBySource = Math.max(1, Math.min(sourceWidth, Math.floor(sourceHeight * ratio)));
    let cropWidth = Math.max(1, Math.min(maxCropWidthByBox, maxCropWidthBySource));
    let cropHeight = Math.max(1, Math.floor(cropWidth / ratio));
    if (cropHeight > boxHeight) {
        cropHeight = boxHeight;
        cropWidth = Math.max(1, Math.floor(cropHeight * ratio));
    }

    const maxX = Math.max(0, sourceWidth - cropWidth);
    const maxY = Math.max(0, sourceHeight - cropHeight);
    const x = Math.max(0, Math.min(maxX, boxX));
    const y = Math.max(0, Math.min(maxY, boxY));
    return {
        x,
        y,
        width: Math.max(1, Math.min(sourceWidth - x, cropWidth)),
        height: Math.max(1, Math.min(sourceHeight - y, cropHeight)),
    };
}

function buildCenterCropRect(
    image: HTMLImageElement,
    aspectWidth: number,
    aspectHeight: number
): CropRect {
    const targetRatio = aspectWidth / aspectHeight;
    const sourceRatio = image.width / image.height;

    if (sourceRatio > targetRatio) {
        const height = image.height;
        const width = Math.max(1, Math.round(height * targetRatio));
        return {
            x: Math.max(0, Math.round((image.width - width) / 2)),
            y: 0,
            width,
            height,
        };
    }

    const width = image.width;
    const height = Math.max(1, Math.round(width / targetRatio));
    return {
        x: 0,
        y: Math.max(0, Math.round((image.height - height) / 2)),
        width,
        height,
    };
}

interface RenderCroppedImageFileInput {
    sourceFile: File;
    image: HTMLImageElement;
    cropRect: CropRect;
    aspectWidth: number;
    aspectHeight: number;
    outputWidth: number;
    quality: number;
    avoidUpscale: boolean;
    fileTag?: string;
    mimeTypeOverride?: string;
}

async function renderCroppedImageFile(input: RenderCroppedImageFileInput): Promise<File> {
    const {
        sourceFile,
        image,
        cropRect,
        aspectWidth,
        aspectHeight,
        outputWidth,
        quality,
        avoidUpscale,
        fileTag,
        mimeTypeOverride,
    } = input;

    const cropSourceWidth = Math.max(1, Math.round(cropRect.width));
    const targetWidth = Math.max(1, Math.round(outputWidth));
    const finalWidth = avoidUpscale ? Math.min(targetWidth, cropSourceWidth) : targetWidth;
    const finalHeight = Math.max(1, Math.round((finalWidth * aspectHeight) / aspectWidth));

    const canvas = document.createElement('canvas');
    canvas.width = finalWidth;
    canvas.height = finalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return sourceFile;
    }

    ctx.drawImage(
        image,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        0,
        0,
        finalWidth,
        finalHeight
    );

    const mimeType = normalizeMimeType(mimeTypeOverride || sourceFile.type);
    const blob = await canvasToBlob(canvas, mimeType, quality);
    if (!blob) {
        return sourceFile;
    }

    const nextName = normalizeFileName(sourceFile.name, mimeType, aspectWidth, aspectHeight, finalWidth, fileTag);
    return new File([blob], nextName, {type: mimeType});
}

function normalizeFileName(
    originalName: string,
    mimeType: string,
    aspectWidth: number,
    aspectHeight: number,
    outputWidth?: number,
    fileTag?: string
): string {
    const extMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const targetExt = extMap[mimeType] || 'jpg';
    const baseName = originalName.replace(/\.[^.]+$/, '') || 'image';
    const tagSuffix = fileTag ? `_${fileTag}` : '';
    const widthSuffix = outputWidth ? `_${Math.max(1, Math.round(outputWidth))}w` : '';
    return `${baseName}_${aspectWidth}x${aspectHeight}${tagSuffix}${widthSuffix}.${targetExt}`;
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
        const frameAspect = aspectWidth / aspectHeight;
        const preferredFrameHeight = Math.min(560, window.innerHeight - 220);
        const maxFrameWidth = Math.max(220, Math.floor(window.innerWidth * 0.84));
        const maxFrameHeight = Math.max(220, Math.floor(window.innerHeight * 0.58));
        let frameHeight = Math.max(220, preferredFrameHeight);
        let frameWidth = frameHeight * frameAspect;
        if (frameWidth > maxFrameWidth) {
            frameWidth = maxFrameWidth;
            frameHeight = frameWidth / frameAspect;
        }
        if (frameHeight > maxFrameHeight) {
            frameHeight = maxFrameHeight;
            frameWidth = frameHeight * frameAspect;
        }
        const sourceWidth = Math.max(1, image.naturalWidth || image.width);
        const sourceHeight = Math.max(1, image.naturalHeight || image.height);
        let zoom = 1;
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let activePointerId: number | null = null;

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
        title.textContent = `裁剪封面（${aspectWidth}:${aspectHeight}）`;
        title.style.fontSize = '16px';
        title.style.fontWeight = '600';
        title.style.marginBottom = '12px';

        const frame = document.createElement('div');
        frame.style.position = 'relative';
        frame.style.width = `${frameWidth}px`;
        frame.style.height = `${frameHeight}px`;
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

        const getFrameSize = () => ({
            width: Math.max(1, frame.getBoundingClientRect().width || frameWidth),
            height: Math.max(1, frame.getBoundingClientRect().height || frameHeight),
        });

        const buildPreviewGeometry = () => {
            const frameSize = getFrameSize();
            const baseFitScale = Math.max(frameSize.width / sourceWidth, frameSize.height / sourceHeight);
            const displayWidth = sourceWidth * baseFitScale * zoom;
            const displayHeight = sourceHeight * baseFitScale * zoom;
            const maxOffsetX = Math.max(0, (displayWidth - frameSize.width) / 2);
            const maxOffsetY = Math.max(0, (displayHeight - frameSize.height) / 2);
            offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX));
            offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY));

            return {
                frameWidth: frameSize.width,
                frameHeight: frameSize.height,
                displayWidth,
                displayHeight,
                left: (frameSize.width - displayWidth) / 2 + offsetX,
                top: (frameSize.height - displayHeight) / 2 + offsetY,
            };
        };

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

        const applyPreview = () => {
            const preview = buildPreviewGeometry();
            previewImage.style.left = `${preview.left}px`;
            previewImage.style.top = `${preview.top}px`;
            previewImage.style.width = `${preview.displayWidth}px`;
            previewImage.style.height = `${preview.displayHeight}px`;
        };

        const cleanup = () => {
            frame.removeEventListener('pointerdown', onPointerDown);
            frame.removeEventListener('touchstart', onTouchStart);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEndDrag);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
            document.removeEventListener('touchcancel', onTouchEnd);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
            document.removeEventListener('keydown', onKeyDown);
            backdrop.remove();
        };

        const buildResult = (): CropModalResult => {
            const preview = buildPreviewGeometry();
            return {
                frameWidth: preview.frameWidth,
                frameHeight: preview.frameHeight,
                displayWidth: preview.displayWidth,
                displayHeight: preview.displayHeight,
                left: preview.left,
                top: preview.top,
            };
        };

        const onEndDrag = () => {
            dragging = false;
            activePointerId = null;
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

        const onPointerMove = (event: PointerEvent) => {
            if (!dragging || activePointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            const nextX = event.clientX;
            const nextY = event.clientY;
            offsetX += nextX - dragStartX;
            offsetY += nextY - dragStartY;
            dragStartX = nextX;
            dragStartY = nextY;
            applyPreview();
        };

        const onPointerUp = (event: PointerEvent) => {
            if (activePointerId !== event.pointerId) {
                return;
            }
            try {
                if (frame.hasPointerCapture(event.pointerId)) {
                    frame.releasePointerCapture(event.pointerId);
                }
            } catch {
                // ignore release errors in non-standard/simulated pointer flows
            }
            onEndDrag();
        };

        const onTouchMove = (event: TouchEvent) => {
            if (!dragging || event.touches.length === 0) {
                return;
            }
            event.preventDefault();
            const touch = event.touches[0];
            const nextX = touch.clientX;
            const nextY = touch.clientY;
            offsetX += nextX - dragStartX;
            offsetY += nextY - dragStartY;
            dragStartX = nextX;
            dragStartY = nextY;
            applyPreview();
        };

        const onTouchEnd = () => {
            onEndDrag();
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        };

        frame.addEventListener('mousedown', (event) => {
            if (window.PointerEvent) {
                return;
            }
            event.preventDefault();
            dragging = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            frame.style.cursor = 'grabbing';
        });

        const onPointerDown = (event: PointerEvent) => {
            event.preventDefault();
            dragging = true;
            activePointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            frame.style.cursor = 'grabbing';
            try {
                frame.setPointerCapture(event.pointerId);
            } catch {
                // some environments may not allow pointer capture; dragging still works via document listeners
            }
        };

        const onTouchStart = (event: TouchEvent) => {
            if (window.PointerEvent || event.touches.length === 0) {
                return;
            }
            event.preventDefault();
            const touch = event.touches[0];
            dragging = true;
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            frame.style.cursor = 'grabbing';
        };

        frame.addEventListener('pointerdown', onPointerDown);
        frame.addEventListener('touchstart', onTouchStart, {passive: false});

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
        document.addEventListener('touchmove', onTouchMove, {passive: false});
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
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
