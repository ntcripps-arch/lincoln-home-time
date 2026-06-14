'use client';

import { useEffect, useRef, useState } from 'react';
import { fieldClass } from '@/components/auth/field-styles';
import { cn } from '@/lib/utils';

// Loads the Google Maps JS Places library once. No-ops without a key, so the
// field degrades to a plain text input.
//
// NOTE: this uses the *new* Places API (`AutocompleteSuggestion`) rather than the
// legacy `places.Autocomplete` widget — Google stopped offering the legacy widget
// to accounts created after March 1, 2025, so on newer keys it silently fails.
// Requires "Places API (New)" + "Maps JavaScript API" enabled on the key.
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

// Minimal shapes for the bits of the new Places API we touch.
interface PlacePrediction {
  placeId?: string;
  text?: { text?: string };
}
interface PlacesLib {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: {
      input: string;
      sessionToken?: unknown;
    }) => Promise<{ suggestions?: { placePrediction?: PlacePrediction | null }[] }>;
  };
  AutocompleteSessionToken: new () => unknown;
}

interface Suggestion {
  id: string;
  text: string;
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
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const libRef = useRef<PlacesLib | null>(null);
  const tokenRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const listId = 'location-suggestions';

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    let cancelled = false;
    loadMaps(key)
      .then(() => {
        if (cancelled) return;
        const places = (window as unknown as { google: { maps: { places: PlacesLib } } }).google.maps.places;
        if (!places?.AutocompleteSuggestion) {
          console.error('[LocationInput] Places API (New) unavailable — enable "Places API (New)" on the key.');
          return;
        }
        libRef.current = places;
        tokenRef.current = new places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch((e) => {
        // Surfaced (not swallowed) so misconfiguration is debuggable.
        console.error('[LocationInput] Google Maps failed to load:', e);
      });
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close the dropdown when clicking outside the field.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function fetchSuggestions(input: string) {
    const lib = libRef.current;
    if (!lib || !input.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: tokenRef.current })
      .then((res) => {
        const items: Suggestion[] = (res.suggestions ?? [])
          .map((s) => s.placePrediction)
          .filter((p): p is PlacePrediction => Boolean(p && p.text?.text))
          .map((p) => ({ id: p.placeId ?? (p.text!.text as string), text: p.text!.text as string }));
        setSuggestions(items);
        setOpen(items.length > 0);
        setActive(-1);
      })
      .catch((e: unknown) => {
        console.error('[LocationInput] autocomplete request failed:', e);
        setOpen(false);
      });
  }

  function handleInput(v: string) {
    onChange(v);
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 200);
  }

  function choose(s: Suggestion) {
    onChangeRef.current(s.text);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    // Start a fresh billing session after a selection.
    const lib = libRef.current;
    if (lib) tokenRef.current = new lib.AutocompleteSessionToken();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Don't let Enter submit the form while picking a place.
      e.preventDefault();
      if (active >= 0 && suggestions[active]) choose(suggestions[active]);
      else setOpen(false);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        className={fieldClass}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Fire before the input's blur so the value sticks.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted',
                  i === active && 'bg-muted',
                )}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
