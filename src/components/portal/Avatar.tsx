// ============================================================================
// Avatar — one place every account picture is rendered
// ============================================================================
// Shows `profile_image` when the account has one and falls back to initials
// otherwise. The fallback also takes over if the image URL 404s (an old object
// was deleted, or the URL was hand-edited), so a broken picture never leaves a
// blank hole in a card.
//
// The element is always square (equal width/height) and the image is drawn with
// `object-cover`, so a picture is never stretched — the stored file is a 1:1
// crop (see SquareCropper) and the display is a circle inscribed in that square,
// matching the existing navy/gold initials disc it replaces.

import { useEffect, useState } from "react";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  src,
  className = "h-16 w-16 text-xl",
  rounded = "rounded-full",
  ring = true,
}: {
  name: string;
  src?: string | null;
  className?: string;
  rounded?: string;
  ring?: boolean;
}) {
  const [errored, setErrored] = useState(false);

  // A new picture must get a fresh chance to load, even if the last one failed.
  useEffect(() => setErrored(false), [src]);

  const ringClass = ring ? "ring-2 ring-[var(--color-gold)] ring-offset-2 ring-offset-white" : "";

  if (src && !errored) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setErrored(true)}
        className={`${className} ${rounded} ${ringClass} flex-shrink-0 object-cover bg-[#f7f5f0]`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} ${rounded} ${ringClass} flex flex-shrink-0 items-center justify-center bg-[var(--color-navy)] font-serif font-bold text-white`}
    >
      {initials(name)}
    </span>
  );
}
