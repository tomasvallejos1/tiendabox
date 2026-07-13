import { Session } from "./session.entity";

export interface ISessionRepository {
  create(userId: string): Promise<Session>;
  getByToken(token: string): Promise<Session | null>;
  deleteByToken(token: string): Promise<boolean>;
}
