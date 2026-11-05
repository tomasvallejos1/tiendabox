import { Session } from "./session.entity";

export interface ISessionRepository {
  create(userId: string): Promise<Session>;
  getByToken(token: string): Promise<Session | null>;
  deleteByToken(token: string): Promise<boolean>;
  // Borra todas las sesiones del usuario menos la de keepToken. Devuelve cuantas borro.
  deleteByUserIdExcept(userId: string, keepToken: string): Promise<number>;
  // Borra todas las sesiones del usuario. Devuelve cuantas borro.
  deleteByUserId(userId: string): Promise<number>;
  // Borra las sesiones vencidas del usuario. Devuelve cuantas borro.
  deleteExpiredByUserId(userId: string): Promise<number>;
}
