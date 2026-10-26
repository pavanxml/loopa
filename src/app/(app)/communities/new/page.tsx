"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/apiClient";
import { PageHeader } from "@/components/data";
import { FieldError } from "@/components/AuthShell";
import { useToast } from "@/components/Toast";

export default function NewCommunityPage() {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState({ name: "", slug: "", description: "", privacy: "public", rules: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  function setName(name: string) {
    // Auto-derive a URL slug from the name, but leave it editable.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
    setForm((f) => ({ ...f, name, slug: f.slug && f.slug !== slugify(f.name) ? f.slug : slug }));
  }
  function slugify(v: string) {
    return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.post<{ slug: string }>("/api/communities", {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        privacy: form.privacy,
        rules: form.rules || undefined,
      });
      show("Community created", "success");
      router.push(`/communities/${res.slug}`);
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
      <PageHeader title="Create a community" subtitle="Give people a place to gather." />
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5" noValidate>
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">Name</label>
          <input id="name" className="input" value={form.name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          <FieldError messages={errors.name} />
        </div>
        <div>
          <label htmlFor="slug" className="mb-1 block text-sm font-medium">Address</label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-[rgb(var(--text-muted))]">loopa/c/</span>
            <input id="slug" className="input" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} required pattern="[a-z0-9-]{3,32}" />
          </div>
          <FieldError messages={errors.slug} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium">Description</label>
          <textarea id="description" className="input min-h-[72px] resize-none" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
        </div>
        <div>
          <label htmlFor="privacy" className="mb-1 block text-sm font-medium">Privacy</label>
          <select id="privacy" className="input" value={form.privacy}
            onChange={(e) => setForm({ ...form, privacy: e.target.value })}>
            <option value="public">Public — anyone can see and join</option>
            <option value="private">Private — anyone can join, only members see posts</option>
            <option value="invite_only">Invite-only — joins need approval</option>
          </select>
        </div>
        <div>
          <label htmlFor="rules" className="mb-1 block text-sm font-medium">Rules <span className="font-normal text-[rgb(var(--text-muted))]">(optional)</span></label>
          <textarea id="rules" className="input min-h-[72px] resize-none" value={form.rules}
            onChange={(e) => setForm({ ...form, rules: e.target.value })} maxLength={2000} />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={submitting || !form.name || !form.slug}>
          {submitting ? "Creating…" : "Create community"}
        </button>
      </form>
    </main>
  );
}
