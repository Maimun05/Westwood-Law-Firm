// ============================================================================
// SquareCropper — dependency-free 1:1 crop
// ============================================================================
// The image is always drawn "cover"-style into a square frame, so it can never
// be stretched: the frame is square and the exported region is the square of
// source pixels currently under it. Drag to reposition, zoom to scale.
//
// WYSIWYG is guaranteed because the preview and the exporter use the SAME
// numbers: the preview is the image at (dw x dh) translated by (x, y), and the
// exporter maps that exact rectangle back to source pixels:
//
//   sx = -x / scale,  sy = -y / scale,  sw = sh = size / scale
//
// `scale` is natural-pixels-per-CSS-pixel, so `sw`/`sh` are ≤ the natural
// dimensions (the image always covers the frame), which keeps drawImage in
// range. Output is a 512x512 WebP (JPEG if the browser can't encode WebP).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type SquareCropperHandle = { getBlob: () => Promise<Blob | null> };

const OUTPUT_PX = 512;
const MAX_ZOOM = 4;

export default forwardRef<SquareCropperHandle, { file: File; onError: (msg: string) => void }>(
  function SquareCropper({ file, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState(0);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

    // Load the picked file into an <img> we can measure and draw.
    useEffect(() => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => setImg(image);
      image.onerror = () => onError("That image could not be read. Please try another file.");
      image.src = url;
      return () => URL.revokeObjectURL(url);
    }, [file, onError]);

    // Track the frame's real pixel size so the maths matches the DOM.
    useLayoutEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const measure = () => setSize(el.clientWidth);
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const natural = img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 0, h: 0 };
    const base = size && natural.w ? Math.max(size / natural.w, size / natural.h) : 0;
    const scale = base * zoom;
    const dw = natural.w * scale;
    const dh = natural.h * scale;

    const clamp = useCallback(
      (x: number, y: number) => ({
        x: Math.min(0, Math.max(size - dw, x)),
        y: Math.min(0, Math.max(size - dh, y)),
      }),
      [size, dw, dh],
    );

    // Centre the image whenever it first loads or the frame is resized.
    useEffect(() => {
      if (!size || !dw || !dh) return;
      setPos({ x: (size - dw) / 2, y: (size - dh) / 2 });
    }, [size, dw, dh]);

    // Zoom keeps whatever is under the centre of the frame in place.
    const applyZoom = (next: number) => {
      if (!scale) {
        setZoom(next);
        return;
      }
      const nextScale = base * next;
      const cx = (size / 2 - pos.x) / scale;
      const cy = (size / 2 - pos.y) / scale;
      setZoom(next);
      setPos(clamp(size / 2 - cx * nextScale, size / 2 - cy * nextScale));
    };

    const onPointerDown = (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!drag.current) return;
      const d = drag.current;
      setPos(clamp(d.x + (e.clientX - d.px), d.y + (e.clientY - d.py)));
    };
    const onPointerUp = (e: React.PointerEvent) => {
      drag.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    };

    useImperativeHandle(ref, () => ({
      getBlob: () =>
        new Promise<Blob | null>((resolve) => {
          if (!img || !scale || !size) return resolve(null);
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = OUTPUT_PX;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            img,
            -pos.x / scale,
            -pos.y / scale,
            size / scale,
            size / scale,
            0,
            0,
            OUTPUT_PX,
            OUTPUT_PX,
          );
          canvas.toBlob(
            (webp) => {
              if (webp) return resolve(webp);
              // Older browsers may not encode WebP; JPEG always works.
              canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", 0.9);
            },
            "image/webp",
            0.85,
          );
        }),
    }));

    return (
      <div className="space-y-4">
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative mx-auto aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-xl border border-[#e8e4dc] bg-[#0d1f3c] cursor-grab active:cursor-grabbing select-none"
        >
          {img && size > 0 && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute left-0 top-0 max-w-none"
              style={{ width: dw, height: dh, transform: `translate(${pos.x}px, ${pos.y}px)` }}
            />
          )}
          {/* Circle guide — the picture is displayed as a circle everywhere. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70"
            style={{ margin: "6%" }}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[#8a9ab5]">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-[var(--color-gold)]"
          />
        </div>
        <p className="text-center text-xs text-[#8a9ab5]">
          Drag the photo to reposition it. The circle is how it will appear.
        </p>
      </div>
    );
  },
);
