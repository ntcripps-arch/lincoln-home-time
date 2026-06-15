'use client';

import { useEffect, useRef, useState } from 'react';
import type { TripSegment } from '@/lib/types';
import { MAX_FLIGHT_REFRESHES, isFlightTrackingActive, nextFlightRefreshMs } from './trip-utils';
import { refreshFlightStatus } from './flight-lookup';

/**
 * A light flight "helpful resource," not a live tracker. While a flight is in
 * its active window, refresh once on open, then sparsely (see nextFlightRefreshMs)
 * — capped at MAX_FLIGHT_REFRESHES per viewing session — so a flight costs ~10
 * API calls at most, and an open-and-close costs just one. Stops as soon as the
 * flight lands or leaves the window.
 *
 * Uses a self-rescheduling setTimeout (delay varies by phase) and reads the
 * latest segment via a ref so a refresh-triggered re-render doesn't restart the
 * schedule. Returns whether auto-refresh is currently live, for a UI indicator.
 */
export function useFlightTracking(seg: TripSegment, tripId: string): boolean {
  const segRef = useRef(seg);
  segRef.current = seg;
  const [live, setLive] = useState(() => isFlightTrackingActive(seg, Date.now()));

  // Re-arm only when the identity of the segment changes, not on every refresh.
  useEffect(() => {
    if (!isFlightTrackingActive(segRef.current, Date.now())) {
      setLive(false);
      return;
    }
    setLive(true);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;

    const stop = () => {
      if (timer) clearTimeout(timer);
      setLive(false);
    };
    const tick = async () => {
      if (cancelled) return;
      if (!isFlightTrackingActive(segRef.current, Date.now()) || count >= MAX_FLIGHT_REFRESHES) {
        stop();
        return;
      }
      count += 1;
      await refreshFlightStatus({ id: segRef.current.id, tripId });
      if (cancelled) return;
      if (!isFlightTrackingActive(segRef.current, Date.now()) || count >= MAX_FLIGHT_REFRESHES) {
        stop();
        return;
      }
      timer = setTimeout(tick, nextFlightRefreshMs(segRef.current, Date.now()));
    };

    void tick(); // refresh immediately on open (counts toward the budget)
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [seg.id, tripId]);

  return live;
}
