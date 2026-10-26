export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="mt-1 text-xs text-red-500" role="alert">
      {messages[0]}
    </p>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[rgb(var(--bg-subtle))] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-loop-600 text-lg font-bold text-white">
            ◎
          </div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-[rgb(var(--text-muted))]">{subtitle}</p>}
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
