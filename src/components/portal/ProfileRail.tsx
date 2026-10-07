// ============================================================================
// Profile rail — the right-hand summary column on dashboard / profile screens
// ============================================================================
// Mirrors the reference dashboard's right rail: an identity card (avatar, name,
// role), contact rows, optional stat tiles and an optional completion ring.
//
// There is no avatar column on `AuthUser` (only lawyers have `Lawyer.profile_image`,
// which is not carried here), so every role renders an initials disc.

import type { AuthUser } from "@/lib/auth";
import { IconClock, IconEnvelope, IconMapPin, IconPhone } from "@/components/Icons";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  className = "h-16 w-16 text-xl",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center rounded-full bg-[var(--color-navy)] font-serif font-bold text-white ring-2 ring-[var(--color-gold)] ring-offset-2 ring-offset-white`}
    >
      {initials(name)}
    </span>
  );
}

export type RailStat = { label: string; value: string | number };

function CompletionRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - clamped / 100);
  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e8e4dc" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--color-navy)]">
        {clamped}%
      </span>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-[var(--color-gold)] mt-0.5 flex-shrink-0">{icon}</span>
      <span className="text-[#2c3347] break-words min-w-0">{children}</span>
    </div>
  );
}

export default function ProfileRail({
  user,
  memberSince,
  stats,
  completion,
  onEditProfile,
}: {
  user: AuthUser;
  memberSince?: string;
  stats?: RailStat[];
  completion?: number;
  onEditProfile?: () => void;
}) {
  const since = memberSince || user.dateCreated;
  const roleLabel = user.position || user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <aside className="xl:sticky xl:top-20 space-y-5">
      <div className="bg-white rounded-xl border border-[#e8e4dc] p-6 text-center">
        <div className="flex justify-center">
          <Avatar name={user.fullName} />
        </div>
        <h3 className="font-serif text-lg font-bold text-[var(--color-navy)] mt-4">
          {user.fullName}
        </h3>
        <p className="text-xs text-[#8a9ab5] capitalize mt-0.5">{roleLabel}</p>

        {typeof completion === "number" && (
          <div className="flex items-center gap-4 mt-5 text-left">
            <CompletionRing percent={completion} />
            <div>
              <p className="text-sm font-semibold text-[#0d1f3c]">Profile completeness</p>
              <p className="text-xs text-[#8a9ab5] mt-0.5">
                Add the missing details to complete your profile.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 pt-5 border-t border-[#e8e4dc] space-y-3 text-left">
          <Row icon={<IconEnvelope className="h-4 w-4" />}>{user.email}</Row>
          <Row icon={<IconPhone className="h-4 w-4" />}>
            {user.phone || <span className="text-[#8a9ab5]">Not provided</span>}
          </Row>
          {user.user_metadata?.city && (
            <Row icon={<IconMapPin className="h-4 w-4" />}>{user.user_metadata.city}</Row>
          )}
          {since && (
            <Row icon={<IconClock className="h-4 w-4" />}>
              Member since {new Date(since).toLocaleDateString()}
            </Row>
          )}
        </div>

        {onEditProfile && (
          <button
            onClick={onEditProfile}
            className="mt-5 w-full text-sm font-semibold text-[var(--color-navy)] border border-[#e8e4dc] hover:border-[var(--color-gold)] rounded-lg px-4 py-2 transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e8e4dc] p-5">
          <h4 className="text-xs font-semibold text-[#2c3347] uppercase tracking-wide mb-4">
            At a glance
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg bg-[#f7f5f0] border border-[#e8e4dc] p-3">
                <p className="font-serif text-2xl font-bold text-[var(--color-navy)]">{s.value}</p>
                <p className="text-[11px] text-[#8a9ab5] mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
