import type { ProcessResult, DailyReading } from '@/types/zones';
import type { TicketDetail, Technician } from '@/types/tickets';
import type { DetailModel } from '@/components/tickets/TicketDetailBody';
import type { UserProfile } from '@/types/auth';

export const analyst: UserProfile = { id: 'design-analyst', full_name: 'Sample Analyst', username: 'analyst', email: 'analyst@example.invalid', role: 'analyst' };
export const technicians: Technician[] = [{ id: 'design-tech', username: 'technician', full_name: 'Sample Technician', email: 'technician@example.invalid', station_ids: ['MarikinaYouthCamp'], is_active: true, active_ticket_count: 3, workload_by_status: { assigned: 1, 'in-progress': 1, pending_review: 1, follow_up: 0 } }];
const stations = ['MarikinaYouthCamp', 'Mandaluyong', 'NapindanII', 'ValenzuelaNHS'];
const coordinates = [[14.65,121.1],[14.58,121.04],[14.54,121.1],[14.7,120.97]];
const readings: DailyReading[] = Array.from({ length: 30 }, (_, day) => stations.map((station_id, index) => ({
  station_id, date: `2023-09-${String(day+1).padStart(2,'0')}`, latitude: coordinates[index][0], longitude: coordinates[index][1],
  rainfall: index === 0 && day % 7 === 0 ? 48 : index === 2 && day % 9 === 0 ? 0 : Math.round((Math.sin(day*.7)+1)*7+index),
  is_anomaly: index === 0 && day % 7 === 0, is_low_anomaly: index === 2 && day % 9 === 0, is_dry_stuck: false,
  lof_score: index === 0 && day % 7 === 0 ? -3.2 : -1, interpolated_flag: false,
}))).flat();
export const result: ProcessResult = {
  run_id: 'design-run', history_saved: false, history_title: 'September rainfall review', processed_at: '2026-10-25T00:00:00Z',
  summary: { total_rows: 120, total_stations: 4, total_anomalies: 5, total_high_anomalies: 5, total_low_anomalies: 4, anomaly_rate: 7.5, anomalous_stations: 2, processing_time_seconds: 1.4, date_range_start: '2023-09-01', date_range_end: '2023-09-30' },
  quality_report: { total_input_rows: 120, total_input_stations: 4, stations_excluded: 0, rows_excluded: 0, rows_filled: 0, summary_text: 'All sample readings are available.', exclusion_details: { zero_valid_stations: 0, insufficient_readings_stations: 0, multi_day_gaps: 0, starts_with_nan: 0, ends_with_nan: 0, duplicates: 0, multi_hour_gaps: 0, hourly_starts_with_nan: 0, hourly_ends_with_nan: 0, hourly_duplicates: 0 } },
  cleaned_data: readings, flagged_data: readings,
  neighbors: Object.fromEntries(stations.map(station => [station, stations.filter(id => id !== station).map((neighbor_id,i) => ({ neighbor_id, distance_km: 4.2+i*2.1 }))])),
  anomaly_summary: stations.slice(0,1).map(station_id => ({ station_id, latitude: 14.65, longitude:121.1, anomaly_count: 5, events: readings.filter(r=>r.station_id===station_id&&r.is_anomaly).map(r=>({date:r.date,rainfall:r.rainfall,lof_score:r.lof_score??-3.2,group_median:9})) })),
  raw_preview: readings.slice(0,8).map(({station_id,date,rainfall})=>({station_id,date,rainfall})), raw_total_rows:120,
  station_health: stations.map((station_id,index)=>({station_id,latitude:coordinates[index][0],longitude:coordinates[index][1],status:index===0?'watch':'normal',bias_ratio:index===0?1.6:1,rain_days:20,top_rate:index===0?.4:.1,times_flagged:index===0?5:0,median_group_size:4,peak_rainfall:48,peak_date:'2023-09-29'})),
  station_stuck_health: [], dry_stuck_summary: [],
};
export const ticket: TicketDetail = {
  id:'design-ticket',ticket_number:24,title:'Check flagged rainfall reading',station_id:stations[0],status:'pending_review',priority:'high',anomaly_zone:'C',analyst_id:analyst.id,
  technician_id:technicians[0].id,technician:technicians[0],technicians:[{...technicians[0],assigned_at:'2023-10-01T00:00:00Z'}],technicians_history:[],
  follow_up_count:0,created_at:'2023-10-01T00:00:00Z',updated_at:'2023-10-02T00:00:00Z',description:'Inspect the station following the selected high reading.',anomaly_data:{rainfall:48,date:'2023-09-29'},
  last_follow_up_at:null,follow_up_notes:null,cancelled_at:null,cancellation_reason:null,assigned_at:'2023-10-01T00:00:00Z',completed_at:'2023-10-02T00:00:00Z',verified_at:null,
};
export const detail: DetailModel = {
  kind:'ticket',refId:'TKT-24',title:ticket.title,status:'pending_review',priority:'high',zone:'C',stationId:stations[0],createdAt:ticket.created_at,updatedAt:ticket.updated_at,
  description:ticket.description,assignees:[{id:technicians[0].id,name:technicians[0].full_name}],anomalyData:ticket.anomaly_data,
  report:{submittedAt:ticket.completed_at,severity:'medium',notes:'Sample inspection notes for the component gallery.',rootCause:'Debris near the rain gauge.',correctiveAction:'Cleaned the gauge and checked its alignment.',issueResolved:true,round:1},
};

export function fixtureFor(key: unknown): unknown {
  const path = Array.isArray(key) ? key[0] : key;
  if (path === '/api/technicians' || path === '/api/tickets/technicians') return technicians;
  if (path === '/api/reports') return { pending: [], follow_up: [], approved: [] };
  return [];
}

export function createFixtureApi() {
  let sample = structuredClone(ticket);
  return async (request: Request): Promise<Response | undefined> => {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/api/tickets') {
      const body = await request.json();
      return Response.json({ ...sample, ...body, id: 'design-ticket', ticket_number: 24, status: 'assigned' });
    }
    if (path === '/api/tickets/design-ticket/technicians' && request.method === 'POST') {
      const body = await request.json();
      sample = { ...sample, technicians: technicians.filter(tech=>body.technician_ids.includes(tech.id)).map(tech=>({...tech,assigned_at:'2023-10-01T00:00:00Z'})) };
      return Response.json(sample);
    }
    if (path.startsWith('/api/tickets/design-ticket/technicians/') && request.method === 'DELETE') {
      const id = path.split('/').at(-1);
      sample = { ...sample, technicians: sample.technicians.filter(tech=>tech.id!==id) };
      return Response.json(sample);
    }
    return undefined;
  };
}
