import { CheckIcon } from "../check-icon";

export function HostShell({
  header,
  footer,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col gap-10 bg-stone-950 px-16 py-10 text-white">
      {header && <header className="flex items-center justify-between gap-8">{header}</header>}
      {children}
      {footer && <footer className="flex items-center justify-end gap-8">{footer}</footer>}
    </main>
  );
}

export function BigButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-2xl bg-amber-400 px-12 py-6 text-4xl font-semibold text-stone-950 transition-opacity disabled:opacity-30"
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-2xl border-2 border-stone-600 px-10 py-6 text-3xl font-semibold text-white transition-opacity disabled:opacity-30"
    />
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-2xl text-red-400">{error}</p>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xl font-medium uppercase tracking-widest text-amber-400">{children}</p>
  );
}

export function SubmissionChip({ name, done }: { name: string; done: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-6 py-4 text-3xl font-medium ${
        done ? "bg-emerald-500 text-stone-950" : "border-2 border-stone-700 text-stone-500"
      }`}
    >
      {done && <CheckIcon className="h-8 w-8" />}
      {name}
    </li>
  );
}
