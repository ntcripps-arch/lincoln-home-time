'use client';

import { useEffect, useRef } from 'react';
import { fieldClass } from '@/components/auth/field-styles';

// Loads the Google Maps JS Places library once. No-ops without a key, so the
// field degrades to a plain text input.
let mapsPromise: Promise<void> | null = null;
function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as { google?: { maps?: { places?: unknown } } };
  if (w.google?.maps?.places) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

export function LocationInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !ref.current) return;
    let cancelled = false;
    loadMaps(key)
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as unknown as { google: { maps: { places: { Autocomplete: new (el: HTMLInputElement, opts: unknown) => { addListener: (e: string, cb: () => void) => void; getPlace: () => { formatted_address?: string; name?: string } } } } } }).google;
        const ac = new g.maps.places.Autocomplete(ref.current, {
          fields: ['formatted_address', 'name'],
          types: ['establishment', 'geocode'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const addr = place.formatted_address ?? '';
          const name = place.name ?? '';
          const text = addr && name && !addr.startsWith(name) ? `${name}, ${addr}` : addr || name;
          if (text) onChangeRef.current(text);
        });
      })
      .catch(() => {
        /* fall back to plain text input */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
