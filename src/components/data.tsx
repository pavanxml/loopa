"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { api, ApiClientError } from "@/lib/apiClient";
import { ErrorState, Skeleton } from "@/components/ui";

/**
 * One data-fetching hook used by every screen, so loading/error/empty
 * handling is consistent everywhere instead of re-implemented per page.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation=useRef(0);

  const reload = useCallback(async () => {
    if (!path) {setLoading(false);return;}
    const current=++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result=await api.get<T>(path);
      if(current===generation.current)setData(result);
    } catch (err) {
      if(current===generation.current)setError(err instanceof ApiClientError ? err.error.message : "Couldn't load this right now.");
    } finally {
      if(current===generation.current)setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { setData(null);reload();return()=>{generation.current++;}; }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Standard loading → error → content wrapper with a working retry. */
export function AsyncBoundary({
  loading, error, onRetry, skeleton, children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) return <>{skeleton ?? <ListSkeleton />}</>;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return <>{children}</>;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[rgb(var(--text-muted))]">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            active === t.id
              ? "bg-loop-600 text-white"
              : "bg-black/5 text-[rgb(var(--text-muted))] hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
