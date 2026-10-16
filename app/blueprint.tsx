import type { MansionRoom } from "@/content/universes";
import type { MysterySearch } from "@/lib/mystery";

// Floor plan of the mansion, drawn like an architect's blueprint. Shows which
// rooms have been searched and what was found. On phones, rooms can be tapped
// to vote for the next search.
export function Blueprint({
  rooms,
  searches,
  bodyRoom,
  showBody = false,
  size = "tv",
  selected,
  onSelect,
  disabled = false,
  highlight,
}: {
  rooms: MansionRoom[];
  searches: MysterySearch[];
  // Where the body is. Only drawn when showBody is set (found, or the murderer's own phone).
  bodyRoom?: string | null;
  showBody?: boolean;
  size?: "tv" | "phone";
  selected?: string | null;
  onSelect?: (key: string) => void;
  disabled?: boolean;
  // The room just searched, outlined on the reveal.
  highlight?: string | null;
}) {
  const cols = Math.max(...rooms.map((r) => r.col)) + 1;
  const rows = Math.max(...rooms.map((r) => r.row)) + 1;
  const tv = size === "tv";

  return (
    <div
      className={`grid w-full rounded-2xl border-4 border-sky-100/80 bg-[#123e7a] ${tv ? "gap-3 p-4" : "gap-1.5 p-2"}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        // Blueprint paper: a faint grid of lines.
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
        backgroundSize: tv ? "28px 28px" : "16px 16px",
      }}
      role={onSelect ? "radiogroup" : undefined}
      aria-label="Mansion floor plan"
    >
      {rooms.map((room) => {
        const visits = searches.filter((s) => s.room_key === room.key);
        const last = visits.at(-1);
        const hasBody = showBody && bodyRoom === room.key;
        const isSelected = selected === room.key;
        const mark = last?.result === "body" ? "☠️" : last?.result === "evidence" ? "🔎" : last ? "✗" : hasBody ? "☠️" : "";
        const label = (
          <>
            <span className={`font-mono font-semibold uppercase tracking-widest ${tv ? "text-xl" : "text-[11px]"}`}>
              {room.name}
            </span>
            {mark && <span className={tv ? "text-4xl" : "text-lg"}>{mark}</span>}
            {visits.length > 0 && (
              <span className={`font-mono text-sky-200/80 ${tv ? "text-base" : "text-[10px]"}`}>
                searched act {visits.map((v) => v.act).join(", ")}
              </span>
            )}
          </>
        );
        const base = `flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center ${
          tv ? "min-h-32 p-3" : "min-h-20 p-1.5"
        }`;
        const tone = isSelected
          ? "border-white bg-white text-[#123e7a]"
          : highlight === room.key
            ? "border-amber-300 bg-amber-300/20 text-white"
            : last
              ? "border-sky-200/40 bg-sky-950/30 text-sky-100/70"
              : "border-sky-100/70 text-white";
        const style = { gridColumnStart: room.col + 1, gridRowStart: room.row + 1 };

        return onSelect ? (
          <button
            key={room.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(room.key)}
            className={`${base} ${tone} disabled:opacity-60`}
            style={style}
          >
            {label}
          </button>
        ) : (
          <div key={room.key} className={`${base} ${tone}`} style={style}>
            {label}
          </div>
        );
      })}
    </div>
  );
}
