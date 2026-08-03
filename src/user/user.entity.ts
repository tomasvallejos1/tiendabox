// Tipo del dato User. Sin logica.
export interface User {
  id: string;
  email: string;
  password: string; // texto plano por ahora, se hashea en un refactor futuro
  role: string; // "cliente" | "owner"
  created_at: string;
}

// Vista de User apta para salir por HTTP: nunca incluye el password.
export type PublicUser = Omit<User, "password">;
