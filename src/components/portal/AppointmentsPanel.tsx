import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Person } from "./Person";
import type { Database } from "@/lib/database.types";

type ApptStatus = Database["public"]["Enums"]["appointment_status"];
type ApptMode = Database["public"]["Enums"]["appointment_mode"];
type Appt = {
  id: string;
  matter_id: string;
  client_id: string;
  lawyer_id: string;
  appointment_type: string;
  date: string;
  time: string;
  mode: ApptMode;
  status: ApptStatus;
  notes: string | null;
};
type MatterLite = {
  id: string;
  matter_number: string;
  title: string;
  client_id: string;
  lawyer_id: string | null;
};

const SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM"];
const TYPES = ["Initial Consultation", "Case Review", "Document Signing", "Follow-up"];
const tone: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Confirmed: "bg-green-50 text-green-700",
  Completed: "bg-blue-50 text-blue-700",
  Cancelled: "bg-gray-100 text-gray-500",
};
const field = "bg-[#f7f5f0] border border-[#e8e4dc] rounded-lg px-3 py-2 text-sm text-[#0d1f3c]";

// One appointments screen for all three roles. The database decides what each may do:
// clients request (Pending) and may cancel; lawyers and admins confirm/complete/cancel.
export default function AppointmentsPanel({
  role,
  userId,
  matters,
}: {
  role: "client" | "lawyer" | "admin";
  userId: string;
  matters: MatterLite[];
}) {
  const [rows, setRows] = useState<Appt[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState<{
    matter_id: string;
    appointment_type: string;
    date: string;
    time: string;
    mode: ApptMode;
    notes: string;
  }>({
    matter_id: "",
    appointment_type: TYPES[0],
    date: "",
    time: SLOTS[0],
    mode: "In-Person",
    notes: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bookable = matters.filter((m) => m.lawyer_id && m.client_id === userId);
  const matterNo = (id: string) => matters.find((m) => m.id === id)?.matter_number ?? "—";

  const load = async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    if (error) setMsg({ ok: false, text: error.message });
    setRows((data as Appt[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = bookable.find((x) => x.id === f.matter_id);
    if (!m || !m.lawyer_id) {
      setMsg({
        ok: false,
        text: "Choose a matter that has an assigned lawyer.",
      });
      return;
    }
    const { error } = await supabase.from("appointments").insert({
      matter_id: m.id,
      client_id: userId,
      lawyer_id: m.lawyer_id,
      appointment_type: f.appointment_type,
      date: f.date,
      time: f.time,
      mode: f.mode,
      status: "Pending",
      notes: f.notes.trim() || null,
    });
    if (error) {
      setMsg({
        ok: false,
        text: /duplicate|unique/i.test(error.message)
          ? "That time is already taken. Please pick another slot."
          : error.message,
      });
      return;
    }
    setMsg({
      ok: true,
      text: "Request sent. You will be notified once the firm confirms.",
    });
    setShow(false);
    await load();
  };

  const setStatus = async (id: string, status: ApptStatus) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    setMsg(error ? { ok: false, text: error.message } : null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold text-[#0d1f3c]">Appointments</h2>
        {role === "client" && (
          <button
            onClick={() => setShow(!show)}
            disabled={!bookable.length}
            className="bg-[#c9a84c] text-[#0d1f3c] text-sm font-semibold px-5 py-2.5 rounded disabled:opacity-40"
          >
            Request appointment
          </button>
        )}
      </div>
      {role === "client" && !bookable.length && (
        <p className="text-xs text-[#8a9ab5]">
          You can book once the firm assigns a lawyer to your matter.
        </p>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}

      {show && (
        <form
          onSubmit={book}
          className="bg-white rounded-xl border border-[#e8e4dc] p-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <select
            required
            className={field}
            value={f.matter_id}
            onChange={(e) => setF({ ...f, matter_id: e.target.value })}
          >
            <option value="">Select matter…</option>
            {bookable.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matter_number} — {m.title}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={f.appointment_type}
            onChange={(e) => setF({ ...f, appointment_type: e.target.value })}
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            required
            type="date"
            min={tomorrow}
            className={field}
            value={f.date}
            onChange={(e) => setF({ ...f, date: e.target.value })}
          />
          <select
            className={field}
            value={f.time}
            onChange={(e) => setF({ ...f, time: e.target.value })}
          >
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className={field}
            value={f.mode}
            onChange={(e) => setF({ ...f, mode: e.target.value as ApptMode })}
          >
            {["In-Person", "Video Call", "Phone Call"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input
            className={field}
            placeholder="Notes (optional)"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
          />
          <button className="sm:col-span-2 bg-[#0d1f3c] text-white text-sm font-semibold py-2.5 rounded">
            Send request
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-[#e8e4dc] overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f7f5f0]">
              {[
                "Matter",
                role === "client" ? "Lawyer" : "Client",
                "Type",
                "When",
                "Mode",
                "Status",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs font-semibold text-[#8a9ab5] uppercase px-5 py-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8e4dc]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-[#8a9ab5]">
                  No appointments yet.
                </td>
              </tr>
            )}
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-4 text-sm font-mono text-[#0d1f3c]">
                  {matterNo(a.matter_id)}
                </td>
                <td className="px-5 py-4 text-sm text-[#2c3347]">
                  <Person id={role === "client" ? a.lawyer_id : a.client_id} />
                </td>
                <td className="px-5 py-4 text-sm text-[#2c3347]">{a.appointment_type}</td>
                <td className="px-5 py-4 text-sm text-[#2c3347]">
                  {new Date(a.date + "T00:00").toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {a.time}
                </td>
                <td className="px-5 py-4 text-sm text-[#2c3347]">{a.mode}</td>
                <td className="px-5 py-4">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tone[a.status] ?? ""}`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-5 py-4 whitespace-nowrap space-x-2">
                  {role !== "client" && a.status === "Pending" && (
                    <button
                      onClick={() => void setStatus(a.id, "Confirmed")}
                      className="text-xs font-semibold text-green-700"
                    >
                      Confirm
                    </button>
                  )}
                  {role !== "client" && a.status === "Confirmed" && (
                    <button
                      onClick={() => void setStatus(a.id, "Completed")}
                      className="text-xs font-semibold text-blue-700"
                    >
                      Mark done
                    </button>
                  )}
                  {["Pending", "Confirmed"].includes(a.status) && (
                    <button
                      onClick={() => void setStatus(a.id, "Cancelled")}
                      className="text-xs font-semibold text-red-600"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
