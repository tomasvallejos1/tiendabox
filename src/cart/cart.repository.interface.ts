import { Cart } from "./cart.entity";

// Contrato del repositorio de Cart. Un carrito activo por cliente.
export interface ICartRepository {
  getByCustomerId(customerId: string): Promise<Cart | null>;
  createForCustomer(customerId: string): Promise<Cart>;
  addItem(cartId: string, productId: string, quantity: number): Promise<void>;
  updateItemQuantity(cartId: string, productId: string, quantity: number): Promise<void>;
  removeItem(cartId: string, productId: string): Promise<boolean>;
  clear(cartId: string): Promise<void>;
}
