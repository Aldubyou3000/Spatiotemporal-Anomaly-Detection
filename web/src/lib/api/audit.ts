import { apiClient } from "./client";

export interface AuditLogEntry {
  id: number;
  created_at: string;
  event: string;
  user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  credential: string | null;
  entity_type: string | null;
  entity_id: string | null;
  changes: { old: unknown; new: unknown } | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  success: boolean;
  error_message: string | null;
  chain_hash: string | null;
  meta: Record<string, unknown> | null;
}

export interface AuditLogListResponse {
  total: number;
  items: AuditLogEntry[];
}

export interface AuditStatEntry {
  event: string;
  total: number;
  failures: number;
}

export interface AuditChainResult {
  id: number;
  created_at: string;
  event: string;
  stored_hash: string;
  prev_hash: string;
  is_intact: boolean;
}

export interface AuditChainReport {
  checked: number;
  tampered: number;
  results: AuditChainResult[];
}

export interface AuditFilters {
  event?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  ip?: string;
  success?: boolean;
  from_dt?: string;
  to_dt?: string;
}

export const auditApi = {
  list(
    filters: AuditFilters = {},
    limit = 50,
    offset = 0,
  ): Promise<AuditLogListResponse> {
    return apiClient.get<AuditLogListResponse>("/api/audit", {
      params: { ...filters, limit, offset } as Record<string, string | number | boolean | undefined>,
    });
  },

  stats(filters: Pick<AuditFilters, "from_dt" | "to_dt"> = {}): Promise<AuditStatEntry[]> {
    return apiClient.get<AuditStatEntry[]>("/api/audit/stats", {
      params: filters as Record<string, string | undefined>,
    });
  },

  verifyIntegrity(fromId = 1, toId?: number): Promise<AuditChainReport> {
    return apiClient.get<AuditChainReport>("/api/audit/integrity", {
      params: { from_id: fromId, to_id: toId },
    });
  },

  exportUrl(filters: AuditFilters = {}): string {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const url = new URL("/api/audit/export", base);
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url.toString();
  },
};
