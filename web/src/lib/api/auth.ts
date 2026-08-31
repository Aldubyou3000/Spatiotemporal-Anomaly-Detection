import { apiClient, setDirectToken } from "./client";
import type { LoginRequest, LoginResponse, UserProfile } from "@/types/auth";

export const authApi = {
  login: async (body: LoginRequest): Promise<LoginResponse> => {
    // 60s for Render free-tier cold start (first hit after ~15 min idle can be 40-50s)
    const res = await apiClient.post<LoginResponse>("/api/auth/login", body, { timeoutMs: 60_000 });
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

  directToken: async () => {
    const res = await apiClient.get<{ access_token: string }>("/api/auth/direct-token");
    if (res.access_token) setDirectToken(res.access_token);
    return res;
  },
};
