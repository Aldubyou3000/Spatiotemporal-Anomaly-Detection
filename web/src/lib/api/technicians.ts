import { apiClient } from "./client";
import type { TechnicianCreate, TechnicianProfile } from "@/types/technicians";

export const techniciansApi = {
  list: () =>
    apiClient.get<TechnicianProfile[]>("/api/technicians"),

  create: (body: TechnicianCreate) =>
    apiClient.post<TechnicianProfile>("/api/technicians", body),
};
