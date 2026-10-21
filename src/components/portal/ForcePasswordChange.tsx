// ============================================================================
// ForcePasswordChange — the wall an admin-created staff account hits first
// ============================================================================
// Accounts created from the admin "Add Account" flow are emailed a random
// temporary password and have `profiles.must_change_password = true`. Until
// that flag is cleared the portal is replaced by this screen, so the
// temporary password can never be used as a lasting credential.
//
// The screen is deliberately self-contained (no portal chrome, no navigation):
// the only two ways out are choosing a new password — which clears the flag —
// or signing out. It reuses `changeOwnPassword`, which writes the new password
// to auth.users and then clears the flag.

import { useState } from "react";

import { changeOwnPassword } from "@/lib/auth";

const input =
  "w-full bg-[var(--surface-sunken)] border border-[var(--line)] rounded-lg px-4 py-2.5 text-sm text-[var(--ink-strong)] " +
  "focus:outline-none focus:border-[#c9a84c] disabled:opacity-50 pr-16";
const label = "text-xs font-semibold text-[var(--ink-body)] uppercase tracking-wide block mb-1.5";

export default function ForcePasswordChange({
  name,
  email,
  onDone,
  onSignOut,
}: {
  name?: string;
  email: string;
  /** Called after the flag is cleared so the app can re-read the profile. */
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Please choose a password of at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    const { error: changeError } = await changeOwnPassword(password, true);
    setBusy(false);

    if (changeError) {
      setError(changeError);
      return;
    }
    onDone();
  };

  return (
    <div className="min-h-screen bg-[var(--navy-solid)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-[#c9a84c]">
            Westwood Law Firm
          </p>
          <p className="mt-1 text-sm text-white/60">Secure Client Portal</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-card)] shadow-[var(--shadow-modal)]">
          <div className="border-b border-[var(--line)] bg-[var(--surface-sunken)] px-6 py-5">
            <h1 className="font-serif text-xl font-bold text-[var(--ink-strong)]">
              Set a new password
            </h1>
            <p className="mt-1 text-sm text-[var(--ink-body)]">
              {name ? `Welcome, ${name}. ` : ""}Your account was created with a temporary password.
              For your security, please choose a new one before continuing.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4 px-6 py-5">
            <p className="text-xs text-[var(--ink-muted)]">
              Signing in as <strong className="text-[var(--ink-strong)]">{email}</strong>
            </p>

            <div>
              <label className={label} htmlFor="fpc-password">
                New password *
              </label>
              <div className="relative">
                <input
                  id="fpc-password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  autoFocus
                  className={input}
                  placeholder="Minimum 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className={label} htmlFor="fpc-confirm">
                Confirm new password *
              </label>
              <input
                id="fpc-confirm"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                className={`${input} pr-4`}
                placeholder="Re-enter your new password"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#c9a84c] px-6 py-3 text-sm font-semibold text-[var(--ink-on-gold)] transition-colors hover:bg-[#e2c87a] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onSignOut}
            disabled={busy}
            className="text-sm text-white/60 transition-colors hover:text-white disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
