"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { ListSkeleton } from "@/components/data";

/** /profile redirects to the signed-in user's own public profile. */
export default function MyProfileRedirect() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get<{ username: string }>("/api/auth/me")
      .then((me) => router.replace(`/profile/${me.username}`))
      .catch(() => { setFailed(true); router.replace("/login"); });
  }, [router]);

  return <main className="mx-auto max-w-2xl px-4 py-6">{failed ? null : <ListSkeleton rows={2} />}</main>;
}
