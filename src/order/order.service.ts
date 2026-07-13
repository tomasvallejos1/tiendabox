import { Order, OrderStatus } from "./order.entity";
import { IOrderRepository } from "./order.repository.interface";
import { IProductRepository } from "../product/product.repository.interface";
import { ICartRepository } from "../cart/cart.repository.interface";
import { ValidationError } from "../errors";

// Orden lineal de estados permitidos (sin "cancelado", que es una rama aparte).
const FLUJO: OrderStatus[] = ["pendiente", "confirmado", "en_preparacion", "listo_para_retirar", "entregado"];

// Logica de negocio de pedidos. Valida productos, stock, y delivery.
export class OrderService {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly productRepository: IProductRepository,
    private readonly cartRepository: ICartRepository,
  ) {}

  async createOrder(
    customerId: string,
    input: {
      delivery_type?: unknown;
      delivery_address?: unknown;
      items?: { product_id: string; quantity: number }[];
    },
  ): Promise<Order> {
    // 1. Validar delivery_type.
    const deliveryType = this.validateDeliveryType(input.delivery_type);
    let deliveryAddress: string | null = null;

    if (deliveryType === "envio") {
      if (typeof input.delivery_address !== "string" || input.delivery_address.trim().length === 0) {
        throw new ValidationError("El campo 'delivery_address' es obligatorio para envios");
      }
      deliveryAddress = input.delivery_address.trim();
    }

    // 2. Determinar items: del input o del carrito del customer.
    let rawItems: { product_id: string; quantity: number }[];
    let fromCart = false;

    if (input.items && input.items.length > 0) {
      rawItems = input.items;
    } else {
      const cart = await this.cartRepository.getByCustomerId(customerId);
      if (!cart || cart.items.length === 0) {
        throw new ValidationError("No hay items para crear el pedido");
      }
      rawItems = cart.items.map((ci) => ({
        product_id: ci.product_id,
        quantity: ci.quantity,
      }));
      fromCart = true;
    }

    // 3. Validar que haya al menos un item.
    if (rawItems.length === 0) {
      throw new ValidationError("El pedido debe tener al menos un item");
    }

    // 4. Validar cada item contra el producto.
    const orderItems: {
      product_id: string;
      product_name: string;
      unit_price: number | null;
      quantity: number;
      type: string;
    }[] = [];

    let total = 0;

    for (const raw of rawItems) {
      const product = await this.productRepository.getById(raw.product_id);

      if (!product || !product.is_active) {
        throw new ValidationError(`Producto no disponible: ${raw.product_id}`);
      }

      if (!Number.isInteger(raw.quantity) || raw.quantity <= 0) {
        throw new ValidationError("La cantidad de cada item debe ser un entero mayor a 0");
      }

      if (product.type === "stock") {
        if (raw.quantity > product.stock) {
          throw new ValidationError(
            `Stock insuficiente para '${product.name}'. Disponible: ${product.stock}`,
          );
        }
        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: raw.quantity,
          type: product.type,
        });
        total += (product.price ?? 0) * raw.quantity;
      } else {
        // Producto tipo "encargo": unit_price null.
        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          unit_price: null,
          quantity: raw.quantity,
          type: product.type,
        });
      }
    }

    // 5. Descontar stock de productos tipo stock.
    // deuda técnica: no transaccional (Postgres orders + Mongo products).
    for (const item of orderItems) {
      if (item.type === "stock") {
        const product = await this.productRepository.getById(item.product_id);
        if (product) {
          await this.productRepository.update(product.id, {
            stock: product.stock - item.quantity,
          });
        }
      }
    }

    // 6-7. Crear la orden con status "pendiente".
    const order = await this.orderRepository.create({
      customer_id: customerId,
      status: "pendiente",
      delivery_type: deliveryType,
      delivery_address: deliveryAddress,
      total,
      items: orderItems,
    });

    // 8. Si los items vinieron del carrito, vaciarlo.
    if (fromCart) {
      const cart = await this.cartRepository.getByCustomerId(customerId);
      if (cart) {
        await this.cartRepository.clear(cart.id);
      }
    }

    return order;
  }

  async getMyOrders(customerId: string): Promise<Order[]> {
    return this.orderRepository.getByCustomerId(customerId);
  }

  async getAllOrders(statusFilter?: string): Promise<Order[]> {
    return this.orderRepository.getAll(statusFilter);
  }

  async getById(id: string): Promise<Order | null> {
    return this.orderRepository.getById(id);
  }

  // Avanza el estado de la orden un paso en el flujo lineal.
  async changeStatus(orderId: string, newStatus: string): Promise<Order | null> {
    const order = await this.orderRepository.getById(orderId);
    if (!order) return null;

    // No se puede cambiar el estado de una orden cancelada.
    if (order.status === "cancelado") {
      throw new ValidationError("No se puede cambiar el estado de una orden cancelada");
    }

    // Validar que newStatus sea un estado válido del flujo.
    const newIndex = FLUJO.indexOf(newStatus as OrderStatus);
    if (newIndex === -1) {
      throw new ValidationError("Estado no válido");
    }

    const currentIndex = FLUJO.indexOf(order.status);

    // Solo permitir avanzar exactamente un paso.
    if (newIndex !== currentIndex + 1) {
      throw new ValidationError("Transición de estado no permitida");
    }

    return this.orderRepository.updateStatus(orderId, newStatus as OrderStatus);
  }

  // Cancela una orden si pertenece al cliente y está pendiente.
  async cancelOrder(orderId: string, customerId: string): Promise<Order | null> {
    const order = await this.orderRepository.getById(orderId);
    if (!order) return null;

    // Verificar que la orden pertenezca al cliente.
    if (order.customer_id !== customerId) {
      throw new ValidationError("No puede cancelar un pedido de otro cliente");
    }

    // Solo se puede cancelar si está pendiente.
    if (order.status !== "pendiente") {
      throw new ValidationError("Solo se puede cancelar un pedido pendiente");
    }

    // TODO: reponer stock al cancelar.

    return this.orderRepository.updateStatus(orderId, "cancelado");
  }

  private validateDeliveryType(value: unknown): "retiro" | "envio" {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'delivery_type' es obligatorio");
    }
    if (value !== "retiro" && value !== "envio") {
      throw new ValidationError("El campo 'delivery_type' debe ser 'retiro' o 'envio'");
    }
    return value as "retiro" | "envio";
  }
}
