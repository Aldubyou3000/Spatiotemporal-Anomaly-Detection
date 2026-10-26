import type { TicketListItem } from "@/types/tickets";

const normalizeSearch = (value: unknown): string => String(value ?? "").toLowerCase().replace(/[_\s-]+/g, "");

/** Match query words at the start of a field or word, never inside a word. */
export function matchesSearch(values: unknown[], query: string): boolean {
  const text = query.trim();
  if (!text) return true;
  const words = text.split(/\s+/).map(normalizeSearch);
  return words.every(word => values.some(value => {
    const field = String(value ?? "").toLowerCase();
    return normalizeSearch(field).startsWith(word)
      || field.split(/[_\s@-]+/).some(part => normalizeSearch(part).startsWith(word));
  }));
}

export function matchesTicketSearch(ticket: Pick<TicketListItem, "ticket_number" | "title" | "station_id" | "technicians">, query: string): boolean {
  if (!query.trim()) return true;
  const text = query.trim().replace(/^(?:tkt[\s#-]*|#)(?=\d)/i, "");
  return matchesSearch([ticket.ticket_number, `TKT-${ticket.ticket_number}`, ticket.title, ticket.station_id,
    ...(ticket.technicians ?? []).map(technician => technician.full_name)], text);
}
