import { Cart } from "./cart.entity";
import { ICartRepository } from "./cart.repository.interface";
import { IProductRepository } from "../product/product.repository.interface";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { ValidationError } from "../errors";

// Logica de negocio del carrito. Valida productos y stock antes de operar.
export class CartService {
  constructor(
    private readonly cartRepository: ICartRepository,
    private readonly productRepository: IProductRepository,
    private readonly customerRepository: ICustomerRepository,
  ) {}

  // Resuelve el customerId a partir del userId del token.
  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.customerRepository.getByUserId(userId);
    if (!customer) {
      throw new ValidationError("No existe un perfil de cliente para este usuario");
    }
    return customer.id;
  }

  // Devuelve el carrito del cliente; si no existe, lo crea vacio.
  async getCart(userId: string): Promise<Cart> {
    const customerId = await this.resolveCustomerId(userId);
    const cart = await this.cartRepository.getByCustomerId(customerId);
    if (cart) {
      return cart;
    }
    return this.cartRepository.createForCustomer(customerId);
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<Cart> {
    const customerId = await this.resolveCustomerId(userId);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError("La cantidad debe ser un entero mayor a 0");
    }

    const product = await this.productRepository.getById(productId);
    if (!product || !product.is_active) {
      throw new ValidationError("Producto no disponible");
    }

    // Si el producto es tipo "stock", la cantidad no puede superar el stock disponible.
    if (product.type === "stock" && quantity > product.stock) {
      throw new ValidationError(
        `Stock insuficiente. Disponible: ${product.stock}`,
      );
    }

    const cart = await this.getCartByCustomerId(customerId);
    const existingItem = cart.items.find((item) => item.product_id === productId);

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (product.type === "stock" && newQuantity > product.stock) {
        throw new ValidationError(
          `Stock insuficiente. Disponible: ${product.stock}, en carrito: ${existingItem.quantity}`,
        );
      }

      await this.cartRepository.updateItemQuantity(cart.id, productId, newQuantity);
    } else {
      await this.cartRepository.addItem(cart.id, productId, quantity);
    }

    // Devuelve el carrito actualizado.
    return (await this.cartRepository.getByCustomerId(customerId))!;
  }

  async removeItem(userId: string, productId: string): Promise<Cart> {
    const customerId = await this.resolveCustomerId(userId);
    const cart = await this.cartRepository.getByCustomerId(customerId);
    if (!cart) {
      throw new ValidationError("El cliente no tiene un carrito activo");
    }

    await this.cartRepository.removeItem(cart.id, productId);
    return (await this.cartRepository.getByCustomerId(customerId))!;
  }

  async clear(userId: string): Promise<void> {
    const customerId = await this.resolveCustomerId(userId);
    const cart = await this.cartRepository.getByCustomerId(customerId);
    if (!cart) {
      return;
    }
    await this.cartRepository.clear(cart.id);
  }

  // Método interno: obtiene el carrito por customerId (ya resuelto).
  private async getCartByCustomerId(customerId: string): Promise<Cart> {
    const cart = await this.cartRepository.getByCustomerId(customerId);
    if (cart) {
      return cart;
    }
    return this.cartRepository.createForCustomer(customerId);
  }
}
