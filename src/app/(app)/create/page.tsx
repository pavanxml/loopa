"use client";

import { useRouter } from "next/navigation";
import { Composer } from "@/components/Composer";
import { PageHeader } from "@/components/data";
import Link from "next/link";

export default function CreatePage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <PageHeader title="Studio" subtitle="A photo, a thought, a little chaos. Make your next drop." />
      <Composer onPosted={() => router.push("/home")} />
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Link href="/moments" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <span className="text-xl" aria-hidden="true">◐</span>
          <span className="text-xs font-medium">Spark</span>
        </Link>
        <Link href="/events/new" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <span className="text-xl" aria-hidden="true">▤</span>
          <span className="text-xs font-medium">Event</span>
        </Link>
        <Link href="/communities/new" className="card flex flex-col items-center gap-1.5 p-4 text-center">
          <span className="text-xl" aria-hidden="true">◈</span>
          <span className="text-xs font-medium">Community</span>
        </Link>
      </div>
    </main>
  );
}
