"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { JoinStep } from "./play/[code]/phone";

// Phones join here with the code on the TV (or scan the QR code, which skips this page).
export default function Home() {
  const router = useRouter();
  return (
    <main className="gathering home" data-world="shell">
      <div className="screen">
        <JoinStep initial="" onJoined={(_, code) => router.push(`/play/${code}?via=code`)} />
        <Link href="/host" className="p-small" style={{ textAlign: "center", color: "var(--ink)" }}>
          Hosting? Open the TV screen on this device
        </Link>
      </div>
    </main>
  );
}
