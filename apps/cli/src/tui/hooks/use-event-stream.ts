import { useState, useEffect } from 'react';
import type { RunEvent } from '@assembler/types';
import { useCliApp } from '../context.js';

export function useEventStream(runId: string | null) {
  const app = useCliApp();
  const [events, setEvents] = useState<RunEvent[]>([]);

  useEffect(() => {
    if (!runId) return;

    let lastSeen = 0;
    const interval = setInterval(async () => {
      try {
        const allEvents = await app.events(runId);
        if (allEvents.length > lastSeen) {
          setEvents([...allEvents]);
          lastSeen = allEvents.length;
        }
      } catch {
        // Run may not exist yet — ignore
      }
    }, 200);

    return () => clearInterval(interval);
  }, [runId, app]);

  return events;
}
