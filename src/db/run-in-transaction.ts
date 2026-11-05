import type { IUserRepository } from "../user/user.repository.interface";
import type { ICustomerRepository } from "../customer/customer.repository.interface";
import type { ISessionRepository } from "../session/session.repository.interface";
import type { ICartRepository } from "../cart/cart.repository.interface";
import type { IOrderRepository } from "../order/order.repository.interface";

// Repositorios de PostgreSQL atados a una misma transaccion. El catalogo (Mongo) no esta:
// no puede participar de una transaccion de Postgres.
export interface TransactionRepositories {
  users: IUserRepository;
  customers: ICustomerRepository;
  sessions: ISessionRepository;
  carts: ICartRepository;
  orders: IOrderRepository;
}

// Ejecuta work de forma atomica con repositorios atados a una transaccion: si work lanza,
// no queda nada guardado. Los services no saben de que base se trata; la implementacion
// real la arma DatabaseProviderFactory.
export type RunInTransaction = <T>(
  work: (repos: TransactionRepositories) => Promise<T>,
) => Promise<T>;
