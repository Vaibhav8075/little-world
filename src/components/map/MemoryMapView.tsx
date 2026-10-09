import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useMemory } from '../../context/MemoryContext';
import type { Memory } from '../../types';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { Photo } from '../common/Photo';
import { coverOf, formatDate, imageSrc, plural } from '../../lib/format';

type GeoMemory = Memory & { location: { name: string; lat: number; lng: number; city?: string } };

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const MemoryMapView: React.FC = () => {
  const { memories, openViewer } = useMemory();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const geoMemories = useMemo(
    () =>
      memories
        .filter((m): m is GeoMemory => typeof m.location?.lat === 'number' && typeof m.location?.lng === 'number')
        .sort((a, b) => b.date.localeCompare(a.date)),
    [memories]
  );
  const selected = geoMemories.find((m) => m.id === selectedId) || null;

  // Create the map once; tear it down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { center: [20.59, 78.96], zoom: 4, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // Tiles are restyled for light/dark in index.css.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Sync markers with the data and fit them in view (only when the set of places changes).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const bounds = L.latLngBounds([]);
    geoMemories.forEach((mem) => {
      const { lat, lng } = mem.location;
      bounds.extend([lat, lng]);
      const src = imageSrc(coverOf(mem), 'thumb');
      const icon = L.divIcon({
        className: 'map-pin',
        html: `<div>${src ? `<img src="${escapeAttr(src)}" alt="" />` : ''}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const marker = L.marker([lat, lng], { icon, title: mem.title, keyboard: true }).addTo(map);
      marker.on('click', () => setSelectedId(mem.id));
      markersRef.current.set(mem.id, marker);
    });

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 });
  }, [geoMemories]);

  // Highlight the selected pin.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      el?.classList.toggle('is-active', id === selectedId);
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    });
  }, [selectedId, geoMemories]);

  const focus = (mem: GeoMemory) => {
    setSelectedId(mem.id);
    mapRef.current?.flyTo([mem.location.lat, mem.location.lng], Math.max(mapRef.current.getZoom(), 9), { duration: 0.6 });
  };

  return (
    <div>
      <PageHeader title="Map" description={plural(geoMemories.length, 'place')} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="relative h-[52dvh] lg:h-[calc(100dvh-13rem)] min-h-[360px] rounded-2xl overflow-hidden border border-line z-0">
          <div ref={containerRef} className="absolute inset-0" />
          {geoMemories.length === 0 && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center p-6 pointer-events-none">
              <p className="max-w-xs text-center text-sm text-ink-2 bg-surface/90 rounded-xl px-4 py-3 shadow-card">
                Memories with photo locations will show up here.
              </p>
            </div>
          )}
          {selected && (
            <button
              type="button"
              onClick={() => openViewer(selected)}
              className="absolute left-3 right-3 bottom-3 sm:right-auto sm:w-80 z-[500] flex gap-3 p-2.5 pr-4 rounded-xl bg-surface shadow-pop text-left animate-enter"
            >
              <Photo src={imageSrc(coverOf(selected), 'thumb')} alt="" className="size-16 rounded-lg shrink-0" />
              <span className="min-w-0 flex-1 self-center">
                <span className="block font-serif text-lg leading-tight truncate">{selected.title}</span>
                <span className="block text-[13px] text-ink-3 truncate">
                  {selected.location.name} · {formatDate(selected.date, 'short')}
                </span>
              </span>
              <ArrowRight className="size-4 self-center text-ink-3" />
            </button>
          )}
        </div>

        {geoMemories.length > 0 && (
          <ul className="lg:h-[calc(100dvh-13rem)] lg:overflow-y-auto space-y-1 -mx-2">
            {geoMemories.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => focus(m)}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors ${
                    selectedId === m.id ? 'bg-sunken' : 'hover:bg-sunken/60'
                  }`}
                >
                  <Photo src={imageSrc(coverOf(m), 'thumb')} alt="" className="size-12 rounded-lg shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[15px] truncate">{m.location.city || m.location.name}</span>
                    <span className="block text-[13px] text-ink-3 truncate">
                      {m.title} · {m.date.slice(0, 4)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
