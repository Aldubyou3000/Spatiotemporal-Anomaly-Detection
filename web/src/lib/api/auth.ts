import { apiClient, setDirectToken } from "./client";
import type { LoginRequest, LoginResponse, UserProfile } from "@/types/auth";

export const authApi = {
  login: async (body: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>("/api/auth/login", body, { timeoutMs: 30_000 });
    if (res.access_token) setDirectToken(res.access_token);
    return res;
  },

  logout: async () => {
    const res = await apiClient.post<{ ok: boolean }>("/api/auth/logout");
    setDirectToken(null);
    return res;
  },

  me: () =>
    apiClient.get<UserProfile>("/api/auth/me"),

  refresh: () =>
    apiClient.post<{ ok: boolean }>("/api/auth/refresh"),
};
