import { useEffect, useRef, useState, type ReactNode } from "react";
import { computeMapCenter, coverageOverlay, mountMap, type MapCenter, type MapPlace, type MountedMap } from "../maps";

export type ProviderMapProps = {
  places: MapPlace[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  heightClass?: string;
  coverage?: { lat: number; lng: number; radiusKm: number } | null;
  ariaLabel: string;
  /** Programmatic centre (Rapido-style picker recenter). Changing it remounts the map there. */
  center?: MapCenter | null;
  zoom?: number;
  /** Polled live centre while the user pans/zooms (Rapido-style fixed-pin pickers). */
  onCenterChange?: (center: MapCenter) => void;
  /** Absolutely-positioned overlay rendered above the map (fixed centre pin, GPS button…). */
  overlay?: ReactNode;
};

/**
 * Interactive vector map with circular photo markers.
 * Falls back to an honest "Map unavailable" note (the list beside it stays
 * fully usable) when the map control cannot render.
 * The container div stays mounted at all times so remounts (recentres) can
 * always find it — swapping it out for the fallback deadlocked remounting.
 */
export function ProviderMap({ places, selectedIndex, onSelect, heightClass = "h-[320px]", coverage, ariaLabel, center, zoom, onCenterChange, overlay }: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<MountedMap | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onCenterRef = useRef(onCenterChange);
  onCenterRef.current = onCenterChange;
  const placesRef = useRef(places);
  placesRef.current = places;
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const placesKey = places.map((p) => `${p.label}:${p.lat},${p.lng}:${p.kind ?? ""}`).join("|");
  const coverageKey = coverage ? `${coverage.lat},${coverage.lng},${coverage.radiusKm}` : "";
  const centerKey = center ? `${center.lat},${center.lng}` : "";

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    setUnavailable(false);
    setLoading(true);
    const container = containerRef.current;
    if (!container) {
      setLoading(false);
      return;
    }
    container.innerHTML = "";
    void (async () => {
      const overlays = coverage ? [coverageOverlay(coverage.lat, coverage.lng, coverage.radiusKm)] : undefined;
      const handle = await mountMap(
        container,
        {
          places,
          overlays,
          center: center ?? undefined,
          zoom,
          onSelectPlace: (idx) => onSelectRef.current(idx),
        },
        () => {
          if (!cancelled) {
            setUnavailable(true);
            setLoading(false);
          }
        },
      );
      if (cancelled) {
        handle?.destroy();
        return;
      }
      handleRef.current = handle;
      if (handle) {
        setLoading(false);
        // Poll the live centre for fixed-pin pickers: HatchMaps exposes no
        // centre getter, so it is derived from the markers' projected points.
        let last: MapCenter | null = null;
        const tick = () => {
          if (cancelled) return;
          if (onCenterRef.current) {
            const c = computeMapCenter(container, placesRef.current);
            if (c && (!last || Math.abs(c.lat - last.lat) > 1e-6 || Math.abs(c.lng - last.lng) > 1e-6)) {
              last = c;
              onCenterRef.current(c);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } else if (!cancelled) {
        // mountMap already routed failures to onUnavailable; never sit on
        // the loading veil if it somehow returns without one.
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // Places/coverage/centre identity is captured via the keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, coverageKey, centerKey]);

  useEffect(() => {
    handleRef.current?.selectPlace(selectedIndex);
  }, [selectedIndex]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${heightClass} w-full overflow-hidden rounded-2xl border border-[var(--border)]`} role="application" aria-label={ariaLabel} />
      {overlay}
      {unavailable ? (
        <div className={`absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 text-center`} role="status" aria-label={ariaLabel}>
          <div>
            <p className="text-2xl" aria-hidden>🗺️</p>
            <p className="mt-1 font-bold text-sm">Map unavailable on this device</p>
            <p className="mt-0.5 text-[13px] text-[var(--dim)]">No problem — use the locality chips, location button, coordinates or cards below this map. Selections and distances still work.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface)]/70" role="status">
          <p className="text-sm font-semibold text-[var(--dim)]">Loading map…</p>
        </div>
      ) : null}
    </div>
  );
}
