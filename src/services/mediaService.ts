import exifr from 'exifr';
import type { ExifMetadata, MediaItem } from '../types';
import { getDB } from './db';

class TactileAudio {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  static playFlipSound() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.1;
        b2 = 0.85 * b2 + white * 0.15;
        const raw = (b0 + b1 + b2) * 0.4;
        const envelope = Math.pow(1 - i / bufferSize, 2);
        data[i] = raw * envelope * 0.25;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch {
      // ignore
    }
  }

  static playClickSound() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      // ignore
    }
  }
}

export class MediaService {
  static playFlip() {
    TactileAudio.playFlipSound();
  }

  static playClick() {
    TactileAudio.playClickSound();
  }

  static async extractMetadata(file: File | Blob): Promise<ExifMetadata> {
    try {
      const parsed = await exifr.parse(file, {
        tiff: true,
        xmp: true,
        gps: true,
        exif: true,
        makerNote: false,
      });

      if (!parsed) {
        return {};
      }

      const metadata: ExifMetadata = {};

      if (parsed.Make || parsed.Model) {
        metadata.camera = [parsed.Make, parsed.Model].filter(Boolean).join(' ');
      }
      if (parsed.LensModel) {
        metadata.lens = parsed.LensModel;
      }
      if (parsed.ISO) {
        metadata.iso = Number(parsed.ISO);
      }
      if (parsed.FNumber) {
        metadata.aperture = `f/${parsed.FNumber}`;
      }
      if (parsed.FocalLength) {
        metadata.focalLength = `${Math.round(parsed.FocalLength)}mm`;
      }
      if (parsed.ExposureTime) {
        const exp = parsed.ExposureTime;
        metadata.exposureTime = exp < 1 ? `1/${Math.round(1 / exp)}s` : `${exp}s`;
      }
      if (parsed.DateTimeOriginal || parsed.CreateDate) {
        const dateObj = new Date(parsed.DateTimeOriginal || parsed.CreateDate);
        if (!isNaN(dateObj.getTime())) {
          metadata.takenAt = dateObj.toISOString();
        }
      }
      if (parsed.latitude && parsed.longitude) {
        metadata.gpsLat = parsed.latitude;
        metadata.gpsLng = parsed.longitude;
      }
      if (parsed.Orientation) {
        metadata.orientation = parsed.Orientation;
      }

      return metadata;
    } catch (err) {
      console.warn('Could not parse EXIF metadata:', err);
      return {};
    }
  }

  static async resizeImage(
    source: File | Blob | string,
    maxDimension: number,
    quality: number = 0.85
  ): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      let objectUrl = '';
      if (typeof source === 'string') {
        img.src = source;
      } else {
        objectUrl = URL.createObjectURL(source);
        img.src = objectUrl;
      }

      img.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas context unavailable'));
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Image conversion to blob failed'));
            }
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({ blob, dataUrl, width, height });
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = (err) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      };
    });
  }

  static async generateVideoPoster(
    videoSource: File | Blob | string
  ): Promise<{ blob: Blob; dataUrl: string; width: number; height: number; duration: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      let objectUrl = '';
      if (typeof videoSource === 'string') {
        video.src = videoSource;
      } else {
        objectUrl = URL.createObjectURL(videoSource);
        video.src = objectUrl;
      }

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.5, video.duration / 2);
      };

      video.onseeked = () => {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const duration = video.duration || 0;

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(width, 800);
        canvas.height = Math.round((height * canvas.width) / width);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return reject(new Error('Canvas context unavailable'));
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (!blob) {
              return reject(new Error('Failed to generate video poster'));
            }
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve({ blob, dataUrl, width, height, duration });
          },
          'image/jpeg',
          0.85
        );
      };

      video.onerror = (err) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      };
    });
  }

  /**
   * Make a file downloaded from Drive displayable on this device (used for memories added on the other
   * phone). Photos are kept as resized copies only; videos keep the original so they can play offline.
   */
  static async storeDownloaded(blob: Blob, item: MediaItem): Promise<Partial<MediaItem>> {
    const db = await getDB();
    const now = new Date().toISOString();
    const put = (suffix: string, b: Blob, mimeType: string) =>
      db.put('media_blobs', { id: `${item.id}-${suffix}`, mediaId: item.id, blob: b, mimeType, sizeBytes: b.size, createdAt: now });

    if (item.type === 'video') {
      await put('orig', blob, item.mimeType || blob.type);
      const url = URL.createObjectURL(blob);
      let thumb: string | undefined;
      try {
        const poster = await this.generateVideoPoster(blob);
        await put('thumb', poster.blob, 'image/jpeg');
        thumb = poster.dataUrl;
      } catch {
        // no poster; the card shows a placeholder
      }
      return { url, largeUrl: url, thumbnailUrl: thumb, mediumUrl: thumb };
    }

    const [thumb, medium, large] = await Promise.all([
      this.resizeImage(blob, 360, 0.8),
      this.resizeImage(blob, 840, 0.85),
      this.resizeImage(blob, 1600, 0.9),
    ]);
    await put('thumb', thumb.blob, 'image/jpeg');
    await put('medium', medium.blob, 'image/jpeg');
    return { url: large.dataUrl, largeUrl: large.dataUrl, mediumUrl: medium.dataUrl, thumbnailUrl: thumb.dataUrl };
  }

  /** Remove the locally stored copies (thumb/medium/original) of the given media items. */
  static async deleteStoredMedia(mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return;
    const db = await getDB();
    for (const id of mediaIds) {
      for (const suffix of ['thumb', 'medium', 'orig']) {
        await db.delete('media_blobs', `${id}-${suffix}`).catch(() => undefined);
      }
    }
  }

  static async processAndStoreMedia(
    file: File,
    memoryId: string,
    order: number = 0
  ): Promise<MediaItem> {
    const mediaId = `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const isVideo = file.type.startsWith('video/');
    const type: 'photo' | 'video' = isVideo ? 'video' : 'photo';

    let metadata: ExifMetadata = {};
    let width = 1200;
    let height = 800;
    let duration = 0;

    let thumbDataUrl = '';
    let mediumDataUrl = '';
    let mainDataUrl = '';

    const db = await getDB();

    if (!isVideo) {
      metadata = await this.extractMetadata(file);

      const [thumbRes, mediumRes, largeRes] = await Promise.all([
        this.resizeImage(file, 360, 0.8),
        this.resizeImage(file, 840, 0.85),
        this.resizeImage(file, 1600, 0.9),
      ]);

      width = largeRes.width;
      height = largeRes.height;
      thumbDataUrl = thumbRes.dataUrl;
      mediumDataUrl = mediumRes.dataUrl;
      mainDataUrl = largeRes.dataUrl;

      await db.put('media_blobs', {
        id: `${mediaId}-thumb`,
        mediaId,
        blob: thumbRes.blob,
        mimeType: 'image/jpeg',
        sizeBytes: thumbRes.blob.size,
        createdAt: new Date().toISOString(),
      });

      await db.put('media_blobs', {
        id: `${mediaId}-medium`,
        mediaId,
        blob: mediumRes.blob,
        mimeType: 'image/jpeg',
        sizeBytes: mediumRes.blob.size,
        createdAt: new Date().toISOString(),
      });

      await db.put('media_blobs', {
        id: `${mediaId}-orig`,
        mediaId,
        blob: file,
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
    } else {
      try {
        const posterRes = await this.generateVideoPoster(file);
        width = posterRes.width;
        height = posterRes.height;
        duration = posterRes.duration;
        thumbDataUrl = posterRes.dataUrl;
        mediumDataUrl = posterRes.dataUrl;

        await db.put('media_blobs', {
          id: `${mediaId}-thumb`,
          mediaId,
          blob: posterRes.blob,
          mimeType: 'image/jpeg',
          sizeBytes: posterRes.blob.size,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Video poster generation fallback:', err);
      }

      mainDataUrl = URL.createObjectURL(file);

      await db.put('media_blobs', {
        id: `${mediaId}-orig`,
        mediaId,
        blob: file,
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      id: mediaId,
      memoryId,
      type,
      url: mainDataUrl,
      thumbnailUrl: thumbDataUrl || mainDataUrl,
      mediumUrl: mediumDataUrl || mainDataUrl,
      largeUrl: mainDataUrl,
      order,
      width,
      height,
      duration: duration || undefined,
      mimeType: file.type,
      sizeBytes: file.size,
      metadata,
    };
  }
}
