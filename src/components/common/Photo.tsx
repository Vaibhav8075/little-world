import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface PhotoProps {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
}

/** An image that fills its box and degrades to a quiet placeholder if missing or broken. */
export const Photo: React.FC<PhotoProps> = ({ src, alt, className = '', imgClassName = '', eager }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;

  return (
    <div className={`relative overflow-hidden bg-sunken ${className}`}>
      {broken ? (
        <div className="absolute inset-0 flex items-center justify-center text-ink-3" aria-label={alt} role="img">
          <ImageOff className="size-6" strokeWidth={1.5} />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedSrc(src)}
          className={`absolute inset-0 size-full object-cover ${imgClassName}`}
        />
      )}
    </div>
  );
};
