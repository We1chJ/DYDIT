type Stat = { label: string; value: string; hint?: string };

export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-card px-3.5 py-3">
          <div className="text-[11.5px] uppercase tracking-[0.06em] text-faint">
            {s.label}
          </div>
          {/* Keyed by value so the number rolls up whenever it changes. */}
          <div
            key={s.value}
            className="anim-num tnum mt-1 text-[21px] font-semibold leading-none tracking-[-0.02em] text-foreground"
          >
            {s.value}
          </div>
          {s.hint ? (
            <div className="mt-1 text-[11.5px] text-muted-foreground">
              {s.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
