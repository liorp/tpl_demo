type CommandPeerLink = {
  peerId: number;
  direction: 'IN' | 'OUT';
  quality: number | null;
  intensity: number | null;
};

type Props = {
  sensorId: number;
  active: boolean;
  links: CommandPeerLink[];
};

function toMetric(value: number | null): string {
  return value === null ? '--' : String(Math.round(value));
}

export function CommandStatusPanel({ sensorId, active, links }: Props) {
  return (
    <aside className="w-72 rounded-md border border-border-bright bg-card/90 p-3 backdrop-blur-sm">
      <p className="font-display text-[11px] tracking-[0.2em] text-muted-foreground">
        CMD STATUS
      </p>
      <p className="mt-1 font-display text-sm text-foreground">
        Sensor #{sensorId}
      </p>
      <p className={`text-xs ${active ? 'text-emerald-400' : 'text-rose-400'}`}>
        {active ? 'active' : 'inactive'}
      </p>
      <div className="mt-3 space-y-1.5">
        {links.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">
            No peer links
          </p>
        ) : (
          links.map((link) => (
            <div
              key={`${link.direction}-${link.peerId}`}
              className="rounded border border-border bg-card-elevated/60 px-2 py-1"
            >
              <p className="font-body text-xs text-foreground">
                {link.direction}{' '}
                {link.direction === 'OUT'
                  ? `${sensorId} -> ${link.peerId}`
                  : `${link.peerId} -> ${sensorId}`}
              </p>
              <p className="font-body text-[11px] text-muted-foreground">
                Q{toMetric(link.quality)} • I{toMetric(link.intensity)}
              </p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
