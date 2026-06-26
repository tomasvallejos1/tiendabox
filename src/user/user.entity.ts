// Tipo del dato User. Sin logica.
export interface User {
  id: string;
  email: string;
  password: string; // texto plano por ahora, se hashea en un refactor futuro
  role: string; // "cliente" | "owner"
  created_at: string;
}
