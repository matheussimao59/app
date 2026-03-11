const fallbackApiUrl = "https://api.unicaprint.com.br/api";
const API_URL = ((((import.meta as any)?.env?.VITE_API_URL as string | undefined) || fallbackApiUrl) || "").replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "api_auth_token";

export type ApiUser = {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
};

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiRequestOptions = {
  method?: ApiMethod;
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new Error("VITE_API_URL nao configurado.");
  }

  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && typeof data.message === "string" && data.message) ||
      `Erro HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export function getApiToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setApiToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearApiToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function apiLogin(email: string, password: string) {
  return await apiRequest<{ message: string; token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

export async function apiRegister(name: string, email: string, password: string) {
  return await apiRequest<{ message: string; token: string; user: ApiUser }>("/auth/register", {
    method: "POST",
    body: { name, email, password }
  });
}

export async function apiMe(token?: string | null) {
  const authToken = token || getApiToken();
  if (!authToken) return null;
  const data = await apiRequest<{ user: ApiUser | null }>("/auth/me", { token: authToken });
  return data.user;
}

export async function apiLogout(token?: string | null) {
  const authToken = token || getApiToken();
  if (!authToken) return;
  await apiRequest<{ message: string }>("/auth/logout", {
    method: "POST",
    token: authToken
  });
}
