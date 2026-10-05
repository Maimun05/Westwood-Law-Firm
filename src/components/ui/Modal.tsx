import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Shared dialog shell for every modal in the app.
 *
 * Provides what the individual dialogs used to each re-implement badly: a
 * portal, a focus trap, focus restoration, a nesting-safe body scroll lock,
 * Escape handling, `role="dialog"` wiring, and entrance/exit animations.
 *
 * The exit animation is why this keeps a closing dialog mounted: `usePresence`
 * flips `data-state` to "closed", lets the CSS animation in `index.css` run,
 * and only then unmounts. Keep `EXIT_MS` in sync with `modal-panel-out`.
 */

/** Must match the `modal-panel-out` / `modal-scrim-out` durations in index.css. */
const EXIT_MS = 160;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

/* ── Shared dialog styling ─────────────────────────────────────────────────
   Exported so all fourteen dialogs stay visually identical. These mirror the
   portal palette (navy #0d1f3c, gold #c9a84c, hairlines #e8e4dc, canvas
   #f7f5f0) and exist only because the portal screens hardcode those hexes
   rather than the `--color-navy` / `--color-gold` theme tokens. */

export const MODAL_PANEL_CLASS =
  "bg-white rounded-2xl border border-[#e8e4dc] shadow-[var(--shadow-modal)]";

export const MODAL_BODY_CLASS = "px-6 py-5";

export const MODAL_LABEL_CLASS =
  "block text-xs font-semibold text-[#8a9ab5] uppercase tracking-wide mb-1.5";

export const MODAL_INPUT_CLASS =
  "w-full bg-white border border-[#e8e4dc] rounded-lg px-3 py-2.5 text-sm text-[#0d1f3c] " +
  "placeholder:text-[#8a9ab5] transition-colors focus:outline-none focus:border-[#c9a84c] " +
  "focus:ring-2 focus:ring-[#c9a84c]/20 disabled:bg-[#f7f5f0] disabled:text-[#8a9ab5]";

export const MODAL_BUTTON_SECONDARY_CLASS =
  "inline-flex items-center justify-center gap-2 border border-[#e8e4dc] hover:border-[#0d1f3c] " +
  "hover:bg-[#f7f5f0] text-[#0d1f3c] text-sm font-semibold py-3 rounded-lg transition-all " +
  "duration-200 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

export const MODAL_BUTTON_PRIMARY_CLASS =
  "inline-flex items-center justify-center gap-2 bg-[#0d1f3c] hover:bg-[#162d52] text-white " +
  "text-sm font-semibold py-3 rounded-lg transition-all duration-200 " +
  "hover:shadow-[var(--shadow-navy-md)] active:scale-[0.99] disabled:opacity-40 " +
  "disabled:pointer-events-none";

export const MODAL_BUTTON_DANGER_CLASS =
  "inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white " +
  "text-sm font-semibold py-3 rounded-lg transition-all duration-200 " +
  "hover:shadow-[0_8px_24px_-4px_rgb(220_38_38/0.35)] active:scale-[0.99] " +
  "disabled:opacity-40 disabled:pointer-events-none";

export const MODAL_ERROR_CLASS =
  "text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2";

/* ── Presence ───────────────────────────────────────────────────────────── */

/** Keeps a dialog mounted for `exitMs` after `open` goes false, so the exit
 *  animation can play, and reports which animation state to render. */
function usePresence(open: boolean, exitMs: number) {
  const [render, setRender] = useState(open);
  const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setRender(true);
      setState("open");
      return;
    }
    if (!render) return;
    setState("closed");
    const timer = window.setTimeout(() => setRender(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, render, exitMs]);

  return { render, state };
}

/* ── Body scroll lock ───────────────────────────────────────────────────── */

// Module-level depth so a dialog opened from inside another dialog (the
// matter detail nests the break-glass and upload dialogs) does not unlock the
// page when the inner one closes.
let lockDepth = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (lockDepth === 0) {
      const { body } = document;
      savedOverflow = body.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      // Compensate for the vanishing scrollbar so the page behind does not jump.
      const gap = window.innerWidth - document.documentElement.clientWidth;
      if (gap > 0) body.style.paddingRight = `${gap}px`;
      body.style.overflow = "hidden";
    }
    lockDepth += 1;
    return () => {
      lockDepth -= 1;
      if (lockDepth === 0) {
        document.body.style.overflow = savedOverflow;
        document.body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [active]);
}

/* ── Focus management ───────────────────────────────────────────────────── */

// Stack of open panels. Only the top-most one reacts to Tab and Escape, so a
// nested dialog does not fight its parent for focus.
const openStack: HTMLElement[] = [];

function isTopmost(panel: HTMLElement | null) {
  return panel !== null && openStack[openStack.length - 1] === panel;
}

function isTabbable(el: HTMLElement) {
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
  return el.getClientRects().length > 0;
}

function useFocusTrap(panelRef: RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;
    openStack.push(panel);
    return () => {
      const index = openStack.indexOf(panel);
      if (index !== -1) openStack.splice(index, 1);
    };
  }, [panelRef, active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel || !isTopmost(panel)) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isTabbable,
      );

      if (items.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = current !== null && panel.contains(current);

      if (!event.shiftKey && (current === last || !inside)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (current === first || current === panel || !inside)) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [active, panelRef]);
}

/* ── Component ──────────────────────────────────────────────────────────── */

type AccessibleName =
  | { /** id of the element holding the dialog title */ labelledBy: string; label?: never }
  | {
      /** accessible name for dialogs with no visible title element */ label: string;
      labelledBy?: never;
    };

export type ModalProps = AccessibleName & {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  align?: "center" | "top";
  describedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Set false while a request is in flight to block every dismissal route. */
  dismissible?: boolean;
  panelClassName?: string;
  layerClassName?: string;
};

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  align = "center",
  labelledBy,
  label,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  dismissible = true,
  panelClassName = "",
  layerClassName = "",
}: ModalProps) {
  const { render, state } = usePresence(open, EXIT_MS);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Callers guard their content on the data being edited — `{matter && ...}` —
  // so by the time the exit animation runs that data is already null and the
  // panel would blank out mid-fade. Hold on to the last real children for the
  // duration of the exit. Pass guarded content as a single child for this to
  // behave predictably.
  const hasContent = children !== null && children !== undefined && children !== false;
  const contentRef = useRef<ReactNode>(children);
  if (hasContent) contentRef.current = children;
  const content = hasContent ? children : contentRef.current;

  useScrollLock(render);
  useFocusTrap(panelRef, render);

  // Hand focus back to whatever opened the dialog once it is gone.
  useEffect(() => {
    if (!render) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Focus the panel rather than the first control so the dialog itself is
    // announced before the user lands on a button.
    panelRef.current?.focus({ preventScroll: true });
    return () => restoreRef.current?.focus?.({ preventScroll: true });
  }, [render]);

  useEffect(() => {
    if (!open || !dismissible || !closeOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!isTopmost(panelRef.current)) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, closeOnEscape, onClose]);

  if (!render) return null;

  return createPortal(
    <div
      className={`modal-layer ${layerClassName}`}
      data-state={state}
      data-align={align}
      onMouseDown={(event) => {
        // The scrim is pointer-events:none, so clicks outside the panel land here.
        if (!dismissible || !closeOnBackdrop) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-scrim" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`modal-panel ${SIZE_CLASS[size]} ${MODAL_PANEL_CLASS} ${panelClassName}`}
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}

/* ── Layout helpers ─────────────────────────────────────────────────────── */

export function ModalHeader({
  eyebrow,
  title,
  titleId,
  description,
  onClose,
  tone = "navy",
  closeLabel = "Close",
  closeDisabled = false,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  onClose?: () => void;
  tone?: "navy" | "light";
  closeLabel?: string;
  closeDisabled?: boolean;
  children?: ReactNode;
}) {
  const navy = tone === "navy";
  return (
    <header
      className={
        navy
          ? "relative overflow-hidden bg-[#0d1f3c] rounded-t-2xl px-6 py-5 flex items-start justify-between gap-4"
          : "relative px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-[#e8e4dc]"
      }
    >
      {navy && <span className="modal-sheen" aria-hidden="true" />}
      <div className="relative min-w-0">
        {eyebrow && (
          <p
            className={`text-xs tracking-widest uppercase font-medium mb-1 ${
              navy ? "text-[#c9a84c]" : "text-[#a8812c]"
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          id={titleId}
          className={`font-serif text-xl font-bold ${navy ? "text-white" : "text-[#0d1f3c]"}`}
        >
          {title}
        </h2>
        {description && (
          <p className={`text-sm mt-1 ${navy ? "text-white/70" : "text-[#2c3347]"}`}>
            {description}
          </p>
        )}
      </div>
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label={closeLabel}
          className={`relative shrink-0 -mr-1 -mt-1 w-8 h-8 rounded-full grid place-items-center text-xl leading-none transition-colors disabled:opacity-30 disabled:pointer-events-none ${
            navy
              ? "text-white/50 hover:text-white hover:bg-white/10"
              : "text-[#8a9ab5] hover:text-[#0d1f3c] hover:bg-[#f7f5f0]"
          }`}
        >
          ×
        </button>
      )}
    </header>
  );
}

/** `className` replaces the default padding rather than adding to it, so
 *  callers never have to fight Tailwind's shorthand/longhand cascade order. */
export function ModalBody({
  children,
  className,
  stagger = false,
}: {
  children: ReactNode;
  className?: string;
  /** Fade each direct child up in sequence. Keep to short lists of fields. */
  stagger?: boolean;
}) {
  return (
    <div className={`${className ?? MODAL_BODY_CLASS} ${stagger ? "modal-stagger" : ""}`}>
      {children}
    </div>
  );
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ?? "px-6 pb-6 pt-1 flex gap-3"}>{children}</div>;
}

export default Modal;
