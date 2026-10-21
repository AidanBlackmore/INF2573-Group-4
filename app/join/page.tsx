"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { JoinStep } from "../play/[code]/phone";

// Phones that can't scan the QR code type the TV's code here.
export default function Join() {
  const router = useRouter();
  return (
    <main className="gathering home" data-world="shell">
      <div className="screen">
        <JoinStep initial="" onJoined={(_, code) => router.push(`/play/${code}?via=code`)} />
        <Link href="/" className="p-small" style={{ textAlign: "center", color: "var(--ink)" }}>
          Hosting? Open the TV screen on this device
        </Link>
      </div>
    </main>
  );
}
