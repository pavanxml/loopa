import Link from "next/link";

export default function SplashPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-loop-600 via-loop-500 to-teal-400 px-6 text-center text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl font-bold backdrop-blur">
          ◎
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">LOOPA</h1>
        <p className="max-w-sm text-balance text-white/85">
          People, content, communities, and activities — looped together. Discover what&apos;s worth your time.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/signup" className="btn bg-white text-loop-700 hover:bg-white/90">
          Create an account
        </Link>
        <Link href="/login" className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20">
          Log in
        </Link>
      </div>
    </main>
  );
}
