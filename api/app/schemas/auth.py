from pydantic import BaseModel


class LoginRequest(BaseModel):
    credential: str
    password: str


class UserProfile(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    role: str


class LoginResponse(BaseModel):
    user: UserProfile
