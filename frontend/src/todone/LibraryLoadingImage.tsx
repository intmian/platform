import React, {useEffect, useMemo, useRef, useState} from 'react';
import {LoadingOutlined} from '@ant-design/icons';

type ImageLoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface LibraryLoadingImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'className' | 'style'> {
    src?: string | null;
    alt: string;
    containerClassName?: string;
    containerStyle?: React.CSSProperties;
    imageClassName?: string;
    imageStyle?: React.CSSProperties;
    placeholder?: React.ReactNode;
}

export default function LibraryLoadingImage({
    src,
    alt,
    containerClassName,
    containerStyle,
    imageClassName,
    imageStyle,
    placeholder,
    onLoad,
    onError,
    ...rest
}: LibraryLoadingImageProps) {
    const normalizedSrc = useMemo(() => (src || '').trim(), [src]);
    const [loadState, setLoadState] = useState<ImageLoadState>(normalizedSrc ? 'loading' : 'idle');
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        setLoadState(normalizedSrc ? 'loading' : 'idle');
    }, [normalizedSrc]);

    useEffect(() => {
        if (!normalizedSrc) {
            return;
        }
        const node = imgRef.current;
        if (!node || !node.complete) {
            return;
        }
        setLoadState(node.naturalWidth > 0 ? 'loaded' : 'error');
    }, [normalizedSrc]);

    const showImage = !!normalizedSrc && loadState !== 'error';
    const showLoading = !!normalizedSrc && loadState === 'loading';
    const showPlaceholder = !normalizedSrc || loadState === 'error';
    const mergedContainerStyle: React.CSSProperties = {
        position: 'relative',
        ...containerStyle,
    };

    return (
        <div className={containerClassName} style={mergedContainerStyle}>
            {showImage ? (
                <img
                    key={normalizedSrc}
                    ref={imgRef}
                    src={normalizedSrc}
                    alt={alt}
                    className={imageClassName}
                    style={{
                        ...imageStyle,
                        opacity: loadState === 'loaded' ? 1 : 0,
                        transition: 'opacity 180ms ease',
                    }}
                    onLoad={(event) => {
                        setLoadState('loaded');
                        onLoad?.(event);
                    }}
                    onError={(event) => {
                        setLoadState('error');
                        onError?.(event);
                    }}
                    {...rest}
                />
            ) : null}
            {showLoading ? (
                <div className="library-image-loading-overlay" aria-label="image-loading">
                    <div className="library-image-loading-indicator">
                        <LoadingOutlined spin />
                    </div>
                </div>
            ) : null}
            {showPlaceholder ? placeholder : null}
        </div>
    );
}
