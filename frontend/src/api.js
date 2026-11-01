const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export async function getJSON(path, options) {
  const res = await fetch(`${API}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const logo = (id) => `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;