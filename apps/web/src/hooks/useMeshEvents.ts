import { useEffect, useState } from "react";
import { getEvents, subscribeEvents } from "../lib/event-store";
import type { MeshEvent, MeshEventKind } from "@aether/types";

type Filter = {
  kind?: MeshEventKind | MeshEventKind[];
  deviceId?: string;
};

export function useMeshEvents(filter?: Filter): MeshEvent[] {
  const [events, setEvents] = useState<MeshEvent[]>(() =>
    applyFilter(getEvents(), filter)
  );

  useEffect(() => {
    // Sync any events that arrived between initial render and effect setup
    setEvents(applyFilter(getEvents(), filter));

    return subscribeEvents(() => {
      setEvents(applyFilter(getEvents(), filter));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return events;
}

function applyFilter(events: MeshEvent[], filter?: Filter): MeshEvent[] {
  const filtered = filter
    ? events.filter((e) => {
        if (filter.kind !== undefined) {
          const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
          if (!kinds.includes(e.kind)) return false;
        }
        if (filter.deviceId !== undefined && e.deviceId !== filter.deviceId) return false;
        return true;
      })
    : events;
  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}
