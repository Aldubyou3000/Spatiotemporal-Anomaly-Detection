import { apiClient } from "./client";
import type { LoginRequest, LoginResponse, UserProfile } from "@/types/auth";

export const authApi = {
  login: (body: LoginRequest) =>
    apiClient.post<LoginResponse>("/api/auth/login", body),

  logout: () =>
    apiClient.post<{ ok: boolean }>("/api/auth/logout"),

  me: () =>
    apiClient.get<UserProfile>("/api/auth/me"),

  refresh: () =>
    apiClient.post<{ ok: boolean }>("/api/auth/refresh"),
};
