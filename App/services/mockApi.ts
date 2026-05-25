export interface MaintenanceTicket {
  ticketId: string;
  stationName: string;
  location: string;
  coordinates: string;
  flaggedAnomaly: string;
  scheduledTime: string;
  status: 'Pending' | 'Completed';
  verificationStatus?: 'Pending Verification' | 'Approved by Analyst';
  notes?: string;
  imageUri?: string | null;
}

const mockDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const activeTickets: MaintenanceTicket[] = [
  {
    ticketId: 'MT-2026-005',
    stationName: 'Science Garden AWS - Stuck Rain Gauge',
    location: 'North Campus, Science Garden',
    coordinates: '40.7128° N, 74.0060° W',
    flaggedAnomaly: 'Rain gauge output frozen at zero during heavy storm cycle',
    scheduledTime: '2026-05-23 14:30 UTC',
    status: 'Pending',
  },
  {
    ticketId: 'MT-2026-008',
    stationName: 'River Ridge AWS - Tilt Sensor Drift',
    location: 'River Ridge Substation',
    coordinates: '40.7146° N, 74.0078° W',
    flaggedAnomaly: 'Tilt sensor reporting inconsistent angle readings during gusts',
    scheduledTime: '2026-05-23 16:00 UTC',
    status: 'Pending',
  },
];

const ticketHistory: MaintenanceTicket[] = [
  {
    ticketId: 'MT-2026-002',
    stationName: 'South Basin AWS - Sensor Cleaning',
    location: 'South Basin Field Site',
    coordinates: '40.7152° N, 74.0039° W',
    flaggedAnomaly: 'Clearing debris from precipitation funnel after elevated readings',
    scheduledTime: '2026-05-20 10:00 UTC',
    status: 'Completed',
    verificationStatus: 'Approved by Analyst',
  },
  {
    ticketId: 'MT-2026-004',
    stationName: 'East Ridge AWS - Pressure Sensor Review',
    location: 'East Ridge Ridgecrest',
    coordinates: '40.7169° N, 74.0094° W',
    flaggedAnomaly: 'Pressure deviations during thunderstorms, pending verification',
    scheduledTime: '2026-05-22 09:30 UTC',
    status: 'Completed',
    verificationStatus: 'Pending Verification',
  },
];

export async function fetchAssignedTicket(): Promise<MaintenanceTicket> {
  await mockDelay(900);
  return { ...activeTickets[0] };
}

export async function fetchActiveTickets(): Promise<MaintenanceTicket[]> {
  await mockDelay(700);
  return activeTickets.map((ticket) => ({ ...ticket }));
}

export async function fetchTicketHistory(): Promise<MaintenanceTicket[]> {
  await mockDelay(700);
  return ticketHistory.map((ticket) => ({ ...ticket }));
}

export async function getTicketById(ticketId: string): Promise<MaintenanceTicket | null> {
  await mockDelay(250);
  const found = activeTickets.find((ticket) => ticket.ticketId === ticketId);
  if (found) {
    return { ...found };
  }
  const history = ticketHistory.find((ticket) => ticket.ticketId === ticketId);
  return history ? { ...history } : null;
}

export async function submitInspectionReport(
  ticketId: string,
  notes: string,
  imageUri: string | null
): Promise<{ success: true; ticketId: string; submittedAt: string }> {
  await mockDelay(1100);

  const activeIndex = activeTickets.findIndex((ticket) => ticket.ticketId === ticketId);
  if (activeIndex !== -1) {
    const ticket = activeTickets.splice(activeIndex, 1)[0];
    const completedTicket: MaintenanceTicket = {
      ...ticket,
      status: 'Completed',
      verificationStatus: 'Pending Verification',
      notes,
      imageUri,
    };
    ticketHistory.unshift(completedTicket);
  }

  return {
    success: true,
    ticketId,
    submittedAt: new Date().toISOString(),
  };
}

export async function deleteTicket(ticketId: string): Promise<{ success: boolean; message: string }> {
  await mockDelay(800);

  // Try to delete from active tickets
  const activeIndex = activeTickets.findIndex((ticket) => ticket.ticketId === ticketId);
  if (activeIndex !== -1) {
    activeTickets.splice(activeIndex, 1);
    return {
      success: true,
      message: `Ticket ${ticketId} deleted successfully`,
    };
  }

  // Try to delete from history
  const historyIndex = ticketHistory.findIndex((ticket) => ticket.ticketId === ticketId);
  if (historyIndex !== -1) {
    ticketHistory.splice(historyIndex, 1);
    return {
      success: true,
      message: `Ticket ${ticketId} deleted successfully`,
    };
  }

  return {
    success: false,
    message: `Ticket ${ticketId} not found`,
  };
}
