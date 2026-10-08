import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { updateProfile, updatePassword } from "@/lib/auth";
import { removeProfilePicture } from "@/lib/services/profilePicture";
import Avatar from "./Avatar";
import ProfilePictureModal from "./ProfilePictureModal";

type Edu = { school: string; degree: string; year?: string };
type Row = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  nickname: string | null;
  honorific: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  date_of_birth: string | null;
  role: string;
  position: string | null;
  bio: string | null;
  education: Edu[] | null;
  profile_image: string | null;
  created_at: string;
};
type Change = {
  id: string;
  created_at: string;
  metadata: Record<string, { old: unknown; new: unknown }> | null;
};

const input =
  "w-full bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm text-[#0d1f3c] focus:outline-none focus:border-[#c9a84c] disabled:opacity-60";
const label = "text-xs font-semibold text-[#2c3347] uppercase tracking-wide block mb-1";
const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  suffix: "Suffix",
  phone: "Phone",
  address: "Address",
  city: "City",
  date_of_birth: "Birthday",
  bio: "Bio",
  education: "Education",
};

export default function ProfileEditor({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved?: () => void;
}) {
  const [row, setRow] = useState<Row | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [edu, setEdu] = useState<Edu[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Voluntary password change (separate from the profile fields: it is not part
  // of the form's submit and writes to auth.users rather than the profile row).
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Profile picture: the upload dialog writes straight to the database, so
  // this only tracks whether it is open and the in-flight "Remove".
  const [showPicture, setShowPicture] = useState(false);
  const [pictureBusy, setPictureBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "first_name,middle_name,last_name,suffix,nickname,honorific,full_name,email,phone,address,city,date_of_birth,role,position,bio,education,profile_image,created_at",
      )
      .eq("id", userId)
      .single();
    if (error || !data) {
      setMsg({
        ok: false,
        text: error?.message ?? "Could not load your profile.",
      });
      return;
    }
    const r = data as Row;
    // Older accounts only have a full name and no structured parts, so derive
    // first/middle/last by splitting it so people can correct them. But when the
    // row already HAS parts, trust them exactly: a NULL middle_name means "no
    // middle name", not "split full_name again". Re-deriving it there invented a
    // phantom middle name for a two-word first name (e.g. first_name "Augoste
    // Ras" + full_name "Augoste Ras Flores" showed a middle name "Ras" that
    // could never be cleared: clearing it wrote NULL, which was already NULL,
    // and the next load re-derived it from full_name).
    const legacyParts = r.first_name == null && r.last_name == null;
    const parts = (r.full_name || "")
      .replace(/^(Atty\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/, "")
      .trim()
      .split(/\s+/);
    setRow(r);
    setF({
      first_name: r.first_name ?? parts[0] ?? "",
      middle_name:
        r.middle_name ?? (legacyParts && parts.length > 2 ? parts.slice(1, -1).join(" ") : ""),
      last_name: r.last_name ?? (parts.length > 1 ? parts[parts.length - 1] : ""),
      suffix: r.suffix ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      date_of_birth: r.date_of_birth ?? "",
      bio: r.bio ?? "",
    });
    setEdu(Array.isArray(r.education) ? r.education : []);
    const { data: log } = await supabase
      .from("audit_logs")
      .select("id,created_at,metadata")
      .eq("resource_type", "profile")
      .eq("resource_id", userId)
      .eq("event_type", "PROFILE_UPDATED")
      .order("created_at", { ascending: false })
      .limit(5);
    setChanges((log as Change[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, [userId]);

  if (!row) return <p className="text-sm text-[#8a9ab5]">{msg?.text ?? "Loading profile…"}</p>;
  const isLawyer = row.role === "lawyer";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const cleanEdu = edu.filter((x) => x.school.trim() || x.degree.trim());
    const { error } = await updateProfile({
      firstName: f.first_name,
      middleName: f.middle_name,
      lastName: f.last_name,
      suffix: f.suffix,
      phone: f.phone,
      address: f.address,
      city: f.city,
      dateOfBirth: f.date_of_birth || null,
      ...(isLawyer ? { bio: f.bio, education: cleanEdu } : {}),
    });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error });
      return;
    }
    setMsg({
      ok: true,
      text: "Profile saved. This change was recorded in your account history.",
    });
    await load();
    onSaved?.();
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (pw.length < 6) {
      setPwMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ ok: false, text: "The two passwords do not match." });
      return;
    }
    setPwBusy(true);
    const { error } = await updatePassword(pw);
    setPwBusy(false);
    if (error) {
      setPwMsg({ ok: false, text: error });
      return;
    }
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: "Password updated." });
  };

  const removePicture = async () => {
    if (!row) return;
    setPictureBusy(true);
    const { error: removeError } = await removeProfilePicture(userId, row.profile_image);
    setPictureBusy(false);
    if (removeError) {
      setMsg({ ok: false, text: removeError });
      return;
    }
    await load();
    onSaved?.();
  };

  const readOnly: [string, string][] = [
    ["Email", row.email],
    ["Role", row.role[0].toUpperCase() + row.role.slice(1)],
    ...(row.position ? [["Position", row.position] as [string, string]] : []),
    [
      "Member since",
      new Date(row.created_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    ],
  ];

  return (
    <form onSubmit={save} className="max-w-2xl space-y-5">
      <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
        <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-4">Profile picture</h3>
        <div className="flex items-center gap-5">
          <Avatar
            name={row.full_name}
            src={row.profile_image}
            className="h-20 w-20 text-2xl"
            ring={false}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowPicture(true)}
                className="border border-[#e8e4dc] hover:border-[#0d1f3c] hover:bg-[#f7f5f0] text-[#0d1f3c] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {row.profile_image ? "Change photo" : "Add photo"}
              </button>
              {row.profile_image && (
                <button
                  type="button"
                  onClick={removePicture}
                  disabled={pictureBusy}
                  className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-50"
                >
                  {pictureBusy ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
            <p className="text-xs text-[#8a9ab5] mt-2">
              A square JPG, PNG or WEBP up to 5 MB. Shown on your account, and on the public site
              for lawyers.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e4dc] p-6 space-y-4">
        <h3 className="font-serif text-lg font-bold text-[#0d1f3c]">Personal information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>First name *</label>
            <input className={input} value={f.first_name} onChange={set("first_name")} required />
          </div>
          <div>
            <label className={label}>Last name *</label>
            <input className={input} value={f.last_name} onChange={set("last_name")} required />
          </div>
          <div>
            <label className={label}>Middle name</label>
            <input className={input} value={f.middle_name} onChange={set("middle_name")} />
          </div>
          <div>
            <label className={label}>Suffix</label>
            <input
              className={input}
              value={f.suffix}
              onChange={set("suffix")}
              placeholder="Jr., III"
            />
          </div>
          <div>
            <label className={label}>Birthday</label>
            <input
              type="date"
              className={input}
              value={f.date_of_birth}
              onChange={set("date_of_birth")}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input
              className={input}
              value={f.phone}
              onChange={set("phone")}
              placeholder="+63 9XX XXX XXXX"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Address</label>
            <input className={input} value={f.address} onChange={set("address")} />
          </div>
          <div>
            <label className={label}>City</label>
            <input className={input} value={f.city} onChange={set("city")} />
          </div>
        </div>
        <p className="text-xs text-[#8a9ab5]">
          Displayed as:{" "}
          <strong className="text-[#0d1f3c]">
            {[
              row.honorific,
              f.first_name,
              row.nickname ? `"${row.nickname}"` : "",
              f.middle_name,
              f.last_name,
            ]
              .filter(Boolean)
              .join(" ")}
            {f.suffix ? `, ${f.suffix}` : ""}
          </strong>
        </p>
      </div>

      {isLawyer && (
        <div className="bg-white rounded-xl border border-[#e8e4dc] p-6 space-y-4">
          <h3 className="font-serif text-lg font-bold text-[#0d1f3c]">Public lawyer profile</h3>
          <div>
            <label className={label}>Bio</label>
            <textarea rows={4} className={input} value={f.bio} onChange={set("bio")} />
          </div>
          <div className="space-y-2">
            <label className={label}>Education</label>
            {edu.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] gap-2">
                <input
                  className={input}
                  placeholder="School"
                  value={x.school}
                  onChange={(e) =>
                    setEdu(edu.map((y, j) => (j === i ? { ...y, school: e.target.value } : y)))
                  }
                />
                <input
                  className={input}
                  placeholder="Degree"
                  value={x.degree}
                  onChange={(e) =>
                    setEdu(edu.map((y, j) => (j === i ? { ...y, degree: e.target.value } : y)))
                  }
                />
                <input
                  className={input}
                  placeholder="Year"
                  value={x.year ?? ""}
                  onChange={(e) =>
                    setEdu(edu.map((y, j) => (j === i ? { ...y, year: e.target.value } : y)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setEdu(edu.filter((_, j) => j !== i))}
                  className="text-xs text-red-600 px-2"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEdu([...edu, { school: "", degree: "", year: "" }])}
              className="text-xs font-semibold text-[#c9a84c]"
            >
              + Add education
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
        {readOnly.map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between py-2.5 border-b border-[#f7f5f0] last:border-0"
          >
            <span className="text-sm text-[#8a9ab5]">{k}</span>
            <span className="text-sm font-medium text-[#0d1f3c]">{v}</span>
          </div>
        ))}
        <p className="text-xs text-[#8a9ab5] mt-3">
          To change your email or role, please contact the firm.
        </p>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      <button
        disabled={busy}
        className="bg-[#c9a84c] hover:bg-[#e2c87a] disabled:opacity-60 text-[#0d1f3c] font-semibold px-6 py-2.5 rounded text-sm"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>

      <div className="bg-white rounded-xl border border-[#e8e4dc] p-6 space-y-4">
        <div>
          <h3 className="font-serif text-lg font-bold text-[#0d1f3c]">Password</h3>
          <p className="text-xs text-[#8a9ab5] mt-1">
            Choose a new password for your account. It must be at least 6 characters.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={input}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={input}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
        </div>
        {pwMsg && (
          <p className={`text-sm ${pwMsg.ok ? "text-green-700" : "text-red-600"}`}>{pwMsg.text}</p>
        )}
        <button
          type="button"
          onClick={changePassword}
          disabled={pwBusy}
          className="bg-[#0d1f3c] hover:bg-[#162d52] disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded text-sm"
        >
          {pwBusy ? "Updating…" : "Update password"}
        </button>
      </div>

      {changes.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e8e4dc] p-6">
          <h3 className="font-serif text-lg font-bold text-[#0d1f3c] mb-3">
            Recent changes to your profile
          </h3>
          <ul className="space-y-2">
            {changes.map((c) => (
              <li key={c.id} className="text-sm text-[#2c3347]">
                <span className="text-[#8a9ab5]">
                  {new Date(c.created_at).toLocaleString("en-PH")}
                </span>
                {" — "}
                {Object.keys(c.metadata ?? {})
                  .map((k) => FIELD_LABELS[k] ?? k)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPicture && (
        <ProfilePictureModal
          userId={userId}
          currentUrl={row.profile_image}
          subjectName={row.full_name}
          onClose={() => setShowPicture(false)}
          onSaved={async () => {
            await load();
            onSaved?.();
          }}
        />
      )}
    </form>
  );
}
