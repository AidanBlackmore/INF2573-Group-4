"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLAYER_HINT } from "@/lib/game";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const trimmed = code.trim().toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-6 py-12">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">Alternate Universes</h1>
        <p className="mt-2 text-lg text-stone-600">{PLAYER_HINT}</p>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) router.push(`/play/${trimmed}`);
        }}
      >
        <label htmlFor="code" className="text-sm font-medium text-stone-600">
          Join with a room code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="WOLF42"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-16 rounded-2xl border border-stone-300 bg-white px-5 text-2xl font-semibold uppercase tracking-widest outline-none focus:border-stone-900"
        />
        <button
          type="submit"
          disabled={!trimmed}
          className="h-16 rounded-2xl bg-stone-900 text-xl font-semibold text-white disabled:opacity-30"
        >
          Join game
        </button>
      </form>

      <Link
        href="/host"
        className="text-center text-base font-medium text-stone-600 underline underline-offset-4"
      >
        Host a game on this screen
      </Link>
    </main>
  );
}
