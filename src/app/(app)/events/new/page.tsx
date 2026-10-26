"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/apiClient";
import { PageHeader } from "@/components/data";
import { FieldError } from "@/components/AuthShell";
import { useToast } from "@/components/Toast";

export default function NewEventPage() {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState({
    title: "", description: "", category: "", mode: "offline",
    location: "", onlineUrl: "", startAt: "", endAt: "", capacity: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pinning, setPinning] = useState(false);

  function pinHere() {
    if (!navigator.geolocation) { show("Your browser doesn't support location.", "error"); return; }
    setPinning(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setPinning(false); show("Venue pinned", "success"); },
      () => { setPinning(false); show("Couldn't get your location. Check browser permissions.", "error"); },
      { timeout: 10000 }
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.post<{ id: string }>("/api/events", {
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        mode: form.mode,
        location: form.mode === "offline" ? form.location : undefined,
        onlineUrl: form.mode === "online" ? form.onlineUrl : undefined,
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        ...(form.mode === "offline" && pin ? pin : {}),
      });
      show("Event created", "success");
      router.push(`/events/${res.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.error.fields ?? {});
        if (!err.error.fields) show(err.error.message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <PageHeader title="Host an event" subtitle="Online or in person." />
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">Title</label>
          <input id="title" className="input" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
          <FieldError messages={errors.title} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">Description</label>
          <textarea id="description" className="input min-h-[80px] resize-none" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={3000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mode" className="mb-1 block text-sm font-medium">Format</label>
            <select id="mode" className="input" value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="offline">In person</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium">Category</label>
            <input id="category" className="input" value={form.category} placeholder="music, tech…"
              onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={40} />
          </div>
        </div>
        {form.mode === "offline" ? (
          <div>
            <label htmlFor="location" className="mb-1 block text-sm font-medium">Location</label>
            <input id="location" className="input" value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} required maxLength={200} />
            <FieldError messages={errors.location} />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="btn-ghost border border-[rgb(var(--border))] text-xs" onClick={pinHere} disabled={pinning}>
                {pinning ? "Locating…" : pin ? "📍 Re-pin to my location" : "📍 Pin to my current location"}
              </button>
              <span className="text-[11px] text-[rgb(var(--text-muted))]">
                {pin ? "Pinned — this event can rank in distance-based Nearby." : "Optional. Lets people nearby find this by real distance."}
              </span>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="onlineUrl" className="mb-1 block text-sm font-medium">Join link</label>
            <input id="onlineUrl" type="url" className="input" value={form.onlineUrl}
              onChange={(e) => setForm({ ...form, onlineUrl: e.target.value })} required />
            <FieldError messages={errors.onlineUrl} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="startAt" className="mb-1 block text-sm font-medium">Starts</label>
            <input id="startAt" type="datetime-local" className="input" value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
            <FieldError messages={errors.startAt} />
          </div>
          <div>
            <label htmlFor="endAt" className="mb-1 block text-sm font-medium">Ends <span className="font-normal text-[rgb(var(--text-muted))]">(optional)</span></label>
            <input id="endAt" type="datetime-local" className="input" value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="capacity" className="mb-1 block text-sm font-medium">Capacity <span className="font-normal text-[rgb(var(--text-muted))]">(optional)</span></label>
          <input id="capacity" type="number" min={1} className="input" value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={submitting || !form.title || !form.startAt}>
          {submitting ? "Creating…" : "Create event"}
        </button>
      </form>
    </main>
  );
}
