// Meta (Hatch) interactive maps loader + helpers.
// The map control ships as a classic script (hatch-maps.js) that sets
// window.HatchMaps. We bundle its source as text and inject it once as a
// Blob-URL classic script so the global is created exactly as designed.
// If the control is unavailable (no WebGL / offline), callers fall back to
// the provider list — a live page ships a vector map or no map.
import hatchMapsJs from "./vendor/hatch-maps.js.txt";
import hatchMapsCss from "./vendor/hatch-maps.css.txt";

export type MapPlace = {
  label: string;
  lat: number;
  lng: number;
  photoUrl?: string;
  kind?: "provider" | "customer" | "area";
  meta?: string;
};

type HatchMapsApi = {
  isMetaMapSupported: () => { supported: boolean };
  mountMap: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => { destroy: () => void; selectPlace: (index: number | null) => void };
};

declare global {
  interface Window {
    HatchMaps?: HatchMapsApi;
  }
}

let loadPromise: Promise<boolean> | null = null;

export function ensureMapsLoaded(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.HatchMaps) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<boolean>((resolve) => {
    try {
      if (!document.getElementById("hatch-maps-css")) {
        const style = document.createElement("style");
        style.id = "hatch-maps-css";
        style.textContent = hatchMapsCss;
        document.head.appendChild(style);
      }
      const blob = new Blob([hatchMapsJs], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => {
        URL.revokeObjectURL(url);
        resolve(Boolean(window.HatchMaps));
      };
      script.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      document.head.appendChild(script);
    } catch {
      resolve(false);
    }
  });
  return loadPromise;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function providerPinHtml(place: MapPlace, selected: boolean): string {
  if (place.kind === "customer") {
    return `<div class="customer-pin${selected ? " customer-pin--on" : ""}" aria-hidden="true">⌂</div>`;
  }
  if (place.kind === "area") {
    return `<div class="area-pin${selected ? " area-pin--on" : ""}" aria-hidden="true">◎</div>`;
  }
  const photo = place.photoUrl
    ? `<img src="${escapeHtml(place.photoUrl)}" alt="" loading="lazy" />`
    : `<span class="provider-pin__initial">${escapeHtml(place.label.slice(0, 1).toUpperCase())}</span>`;
  const meta = place.meta ? `<span class="provider-pin__meta">${escapeHtml(place.meta)}</span>` : "";
  return `<div class="provider-pin${selected ? " provider-pin--on" : ""}">${photo}${meta}</div>`;
}

export type MountedMap = { destroy: () => void; selectPlace: (index: number | null) => void };

/**
 * Mount the vector map. Mirrors the bundled map_helpers.mountMap contract:
 * capability check first, fatal errors routed to onUnavailable.
 */
export async function mountMap(
  container: HTMLElement,
  options: {
    places: MapPlace[];
    baseStyle?: "light" | "dark" | "grayscale";
    center?: { lat: number; lng: number };
    zoom?: number;
    overlays?: unknown[];
    onSelectPlace?: (index: number | null) => void;
  },
  onUnavailable: () => void,
): Promise<MountedMap | null> {
  const loaded = await ensureMapsLoaded();
  if (!loaded || !window.HatchMaps) {
    onUnavailable();
    return null;
  }
  const { supported } = window.HatchMaps.isMetaMapSupported();
  if (!supported) {
    onUnavailable();
    return null;
  }
  try {
    const handle = window.HatchMaps.mountMap(container, {
      places: options.places,
      baseStyle: options.baseStyle ?? "light",
      center: options.center,
      zoom: options.zoom,
      overlays: options.overlays,
      marker: (place: MapPlace, _index: number, selected: boolean) => providerPinHtml(place, selected),
      onSelectPlace: options.onSelectPlace,
      clientId: "artifact_web",
      onFatalError: onUnavailable,
    });
    return handle;
  } catch {
    onUnavailable();
    return null;
  }
}

export type MapCenter = { lat: number; lng: number };

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function latFromMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * Derive the map's current centre from the rendered marker positions.
 * HatchMaps does not expose the underlying map instance, but every place is
 * rendered as a `.maplibregl-marker` whose anchor (bottom-centre) sits on its
 * projected point. Two markers with known coordinates pin down the Web
 * Mercator world size, which yields the exact centre — this is what makes a
 * fixed "Rapido-style" centre pin possible on the real vector map.
 * Returns null when the markers are not measurable yet.
 */
export function computeMapCenter(container: HTMLElement, places: MapPlace[]): MapCenter | null {
  if (places.length < 2) return null;
  const els = container.querySelectorAll(".maplibregl-marker");
  if (els.length !== places.length) return null;
  const cRect = container.getBoundingClientRect();
  if (cRect.width < 10 || cRect.height < 10) return null;
  const points = places.map((p, i) => {
    const el = els[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - cRect.left, y: r.bottom - cRect.top, lat: p.lat, lng: p.lng };
  });
  if (points.some((p) => p === null)) return null;
  const pts = points as { x: number; y: number; lat: number; lng: number }[];
  // Reference pair: widest horizontal separation with distinct longitudes.
  let a = pts[0]!;
  let b = pts[1]!;
  let best = -1;
  for (const p of pts) {
    for (const q of pts) {
      if (p === q) continue;
      const dx = Math.abs(p.x - q.x);
      if (Math.abs(p.lng - q.lng) > 1e-9 && dx > best) { best = dx; a = p; b = q; }
    }
  }
  if (best < 8) return null;
  const worldSize = ((a.x - b.x) * 360) / (a.lng - b.lng);
  if (!Number.isFinite(worldSize) || worldSize <= 0) return null;
  const cx = cRect.width / 2;
  const cy = cRect.height / 2;
  const lng = a.lng + ((cx - a.x) * 360) / worldSize;
  const centerMercY = mercatorY(a.lat) + (cy - a.y) / worldSize;
  const lat = latFromMercatorY(centerMercY);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** GeoJSON polygon approximating a coverage circle (for the service-area overlay). */
export function circleGeoJSON(lat: number, lng: number, radiusKm: number): object {
  const points: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos(latRad));
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    points.push([lng + Math.cos(t) * dLng, lat + Math.sin(t) * dLat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [points] } },
    ],
  };
}

export function coverageOverlay(lat: number, lng: number, radiusKm: number): object {
  return {
    id: "coverage",
    data: circleGeoJSON(lat, lng, radiusKm),
    layers: [
      {
        id: "coverage-fill",
        type: "fill",
        source: "coverage",
        paint: { "fill-color": "#e8650a", "fill-opacity": 0.18 },
      },
      {
        id: "coverage-line",
        type: "line",
        source: "coverage",
        paint: { "line-color": "#e8650a", "line-width": 2 },
      },
    ],
  };
}

function placeQuery(place: { label: string; address?: string; locality?: string }): string {
  return [place.label, place.address, place.locality].filter(Boolean).join(", ");
}

export function mapsSearchUrl(place: { label: string; address?: string; locality?: string; lat?: number; lng?: number }): string | null {
  const name = place.label.trim();
  const hasLocator = Boolean(place.address?.trim() || place.locality?.trim());
  const query = name && hasLocator ? placeQuery(place) : typeof place.lat === "number" && typeof place.lng === "number" ? `${place.lat},${place.lng}` : placeQuery(place);
  if (!query) return null;
  const isCoords = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(query.trim());
  const q = isCoords ? query.trim() : encodeURIComponent(query.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
