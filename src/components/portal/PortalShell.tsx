// ============================================================================
// Portal shell — the dashboard chrome shared by the client / lawyer / admin portals
// ============================================================================
// Fixed navy sidebar (icon + label, collapsing to an icon-only rail below `lg`),
// a sticky top bar with a role-scoped search box, the notification bell and an
// account menu, and the page content. The shell owns the frame; each view owns
// the data behind the search index it passes in.
//
// Icons are resolved from a key→icon map so the three views keep passing the
// same `{ key, label }[]` tab arrays they always have.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import BrandLogo, { BrandMark } from "@/components/BrandLogo";

import {
  IconBell,
  IconBriefcase,
  IconChartBar,
  IconChevronDown,
  IconClock,
  IconDocumentText,
  IconEnvelope,
  IconGavel,
  IconHandshake,
  IconHome,
  IconLogOut,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
  IconX,
} from "@/components/Icons";

import type { AuthUser } from "@/lib/auth";

import { initials } from "./ProfileRail";

export type PortalSearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string;
  tab: string;
};

type Tab = { key: string; label: string };
type IconComponent = React.ComponentType<{ className?: string }>;

const TAB_ICONS: Record<string, IconComponent> = {
  dashboard: IconHome,
  matters: IconBriefcase,
  appointments: IconClock,
  documents: IconDocumentText,
  partners: IconHandshake,
  clients: IconUsers,
  users: IconUsers,
  intake: IconEnvelope,
  lawyers: IconGavel,
  content: IconDocumentText,
  reports: IconChartBar,
  settings: IconSettings,
  audit: IconShield,
  profile: IconUser,
};

function roleLabelFor(role: AuthUser["role"]) {
  return role === "client" ? "Client Portal" : role === "lawyer" ? "Lawyer Portal" : "Admin Portal";
}

// ── Search ────────────────────────────────────────────────────────────────────

function SearchBox({
  items,
  placeholder,
  onSelect,
}: {
  items: PortalSearchItem[];
  placeholder: string;
  onSelect: (item: PortalSearchItem) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return items
      .filter((it) =>
        `${it.title} ${it.subtitle ?? ""} ${it.keywords ?? ""}`.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [q, items]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(item: PortalSearchItem) {
    onSelect(item);
    setQ("");
    setOpen(false);
    setMobileOpen(false);
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
    }
  }

  const showResults = open && q.trim().length > 0;

  const resultsList = showResults && (
    <div className="absolute left-0 right-0 top-full mt-2 z-[450] bg-white rounded-xl border border-[#e8e4dc] shadow-[var(--shadow-modal)] overflow-hidden">
      {results.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[#8a9ab5]">No matches for “{q.trim()}”.</p>
      ) : (
        <ul role="listbox">
          {results.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${
                  i === active ? "bg-[#f7f5f0]" : "bg-white"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#0d1f3c] truncate">
                    {it.title}
                  </span>
                  {it.subtitle && (
                    <span className="block text-xs text-[#8a9ab5] truncate">{it.subtitle}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const inputEl = (
    <div className="relative">
      <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a9ab5]" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg pl-9 pr-9 py-2 text-sm text-[#0d1f3c] focus:outline-none focus:border-[var(--color-gold)]"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            setOpen(false);
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8a9ab5] hover:text-[#0d1f3c] p-1"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div ref={boxRef} className="relative">
      {/* Desktop: inline input. */}
      <div className="hidden md:block w-56 lg:w-80">
        {inputEl}
        {resultsList}
      </div>

      {/* Mobile: icon that reveals a full-width panel under the bar. */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={placeholder}
        aria-expanded={mobileOpen}
        className="md:hidden p-2 rounded-lg text-[#8a9ab5] hover:text-[#0d1f3c] hover:bg-[#f7f5f0]"
      >
        <IconSearch className="h-5 w-5" />
      </button>
      {mobileOpen && (
        <div className="md:hidden fixed left-0 right-0 top-16 z-[450] px-4 py-3 bg-white border-b border-[#e8e4dc] shadow-[var(--shadow-lg)]">
          {inputEl}
          {resultsList}
        </div>
      )}
    </div>
  );
}

// ── Account menu ──────────────────────────────────────────────────────────────

function UserMenu({
  user,
  onSignOut,
  onProfile,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onProfile?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full pl-0.5 pr-1 py-0.5 hover:bg-[#f7f5f0] transition-colors"
      >
        <span
          aria-hidden="true"
          className="h-9 w-9 flex items-center justify-center rounded-full bg-[var(--color-navy)] text-white text-xs font-bold ring-2 ring-[var(--color-gold)]/40"
        >
          {initials(user.fullName)}
        </span>
        <span className="hidden lg:block text-left leading-tight">
          <span className="block text-sm font-semibold text-[#0d1f3c] truncate max-w-[150px]">
            {user.fullName}
          </span>
          <span className="block text-[11px] text-[#8a9ab5] capitalize">{user.role}</span>
        </span>
        <IconChevronDown className="h-4 w-4 text-[#8a9ab5] hidden lg:block" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 z-[450] bg-white rounded-xl border border-[#e8e4dc] shadow-[var(--shadow-modal)] py-2"
        >
          <div className="px-4 py-2 border-b border-[#e8e4dc]">
            <p className="text-sm font-semibold text-[#0d1f3c] truncate">{user.fullName}</p>
            <p className="text-xs text-[#8a9ab5] truncate">{user.email}</p>
          </div>
          {onProfile && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onProfile();
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#2c3347] hover:bg-[#f7f5f0]"
            >
              <IconUser className="h-4 w-4" />
              My Profile
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSignOut();
              setOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <IconLogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function PortalShell({
  currentUser,
  tabs,
  activeTab,
  onTab,
  onSignOut,
  unreadCount = 0,
  onOpenNotifications,
  searchPlaceholder = "Search…",
  searchItems,
  onSearchSelect,
  children,
}: {
  currentUser: AuthUser;
  tabs: Tab[];
  activeTab: string;
  onTab: (t: string) => void;
  onSignOut: () => void;
  unreadCount?: number;
  onOpenNotifications?: () => void;
  searchPlaceholder?: string;
  searchItems?: PortalSearchItem[];
  onSearchSelect?: (item: PortalSearchItem) => void;
  children: ReactNode;
}) {
  const roleLabel = roleLabelFor(currentUser.role);
  const activeLabel = tabs.find((t) => t.key === activeTab)?.label ?? roleLabel;
  const hasProfileTab = tabs.some((t) => t.key === "profile");

  return (
    <div className="min-h-screen bg-[#f7f5f0]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[300] flex w-16 lg:w-64 flex-col bg-[var(--color-navy)]">
        <div className="h-16 flex items-center justify-center lg:justify-start lg:px-5 border-b border-white/10 flex-shrink-0">
          <span className="lg:hidden">
            <BrandMark tone="light" className="h-9 w-9" />
          </span>
          <span className="hidden lg:flex">
            <BrandLogo tone="light" />
          </span>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-2 lg:px-3 space-y-1">
          {tabs.map((t) => {
            const TabIcon = TAB_ICONS[t.key] ?? IconDocumentText;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTab(t.key)}
                title={t.label}
                aria-label={t.label}
                aria-current={isActive ? "page" : undefined}
                className={`relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors justify-center lg:justify-start ${
                  isActive
                    ? "bg-white/10 text-[var(--color-gold)]"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-full bg-[var(--color-gold)]" />
                )}
                <TabIcon className="h-5 w-5 flex-shrink-0" />
                <span className="hidden lg:inline truncate">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-2 lg:p-3 border-t border-white/10 flex-shrink-0">
          <button
            type="button"
            onClick={onSignOut}
            title="Sign Out"
            aria-label="Sign Out"
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-colors justify-center lg:justify-start"
          >
            <IconLogOut className="h-5 w-5 flex-shrink-0" />
            <span className="hidden lg:inline">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="pl-16 lg:pl-64 flex min-h-screen flex-col">
        <header className="sticky top-0 z-[200] h-16 bg-white/95 backdrop-blur border-b border-[#e8e4dc] flex items-center gap-3 px-4 lg:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-base lg:text-lg font-bold text-[#0d1f3c] truncate leading-tight">
              {activeLabel}
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-gold)] font-medium truncate">
              {roleLabel}
            </p>
          </div>

          {searchItems && onSearchSelect && (
            <SearchBox
              items={searchItems}
              placeholder={searchPlaceholder}
              onSelect={onSearchSelect}
            />
          )}

          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              aria-label={
                unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
              }
              className="relative p-2 rounded-lg text-[#8a9ab5] hover:text-[#0d1f3c] hover:bg-[#f7f5f0] transition-colors"
            >
              <IconBell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}

          <UserMenu
            user={currentUser}
            onSignOut={onSignOut}
            onProfile={hasProfileTab ? () => onTab("profile") : undefined}
          />
        </header>

        <main className="flex-1 w-full px-4 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
