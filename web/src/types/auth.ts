export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: "analyst" | "technician";
}

export interface LoginRequest {
  credential: string;
  password: string;
}

export interface LoginResponse {
  user: UserProfile;
}
