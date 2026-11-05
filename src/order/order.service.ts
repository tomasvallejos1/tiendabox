import { Order, OrderStatus, OrderWithCustomer } from "./order.entity";
import { IOrderRepository } from "./order.repository.interface";
import { IProductRepository } from "../product/product.repository.interface";
import { ICartRepository } from "../cart/cart.repository.interface";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { Customer } from "../customer/customer.entity";
import { ValidationError, ForbiddenError } from "../errors";
import { requireId } from "../validation";

// Logica de negocio de pedidos. Valida productos, stock, y delivery.

// Orden lineal permitido para transiciones de estado.
const FLUJO: OrderStatus[] = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "listo_para_retirar",
  "entregado",
];

// Estados desde los que se puede cancelar, segun quien cancela.
const CANCELABLE_POR_OWNER: OrderStatus[] = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "listo_para_retirar",
];
const CANCELABLE_POR_CLIENTE: OrderStatus[] = ["pendiente"];

const CAMBIO_CONCURRENTE = "El pedido cambió de estado mientras se procesaba. Volvé a cargarlo.";

const ITEM_INVALIDO = "Cada item debe tener 'product_id' y 'quantity'";

type ItemInput = { product_id: string; quantity: number };

export class OrderService {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly productRepository: IProductRepository,
    private readonly cartRepository: ICartRepository,
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

  // Enriquece los pedidos con los datos de su cliente. Trae todos los clientes en una
  // sola consulta con getByIds (nunca getById en loop). El email queda afuera a
  // proposito: vive en users y sumaria ese repositorio al service.
  private async withCustomers(orders: Order[]): Promise<OrderWithCustomer[]> {
    const ids = [...new Set(orders.map((order) => order.customer_id))];
    const customers = await this.customerRepository.getByIds(ids);
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));

    return orders.map((order) => {
      const customer = customersById.get(order.customer_id);
      return {
        ...order,
        // null si el cliente fue eliminado.
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              address: customer.address,
              government_id: customer.government_id,
              tax_status: customer.tax_status,
            }
          : null,
      };
    });
  }

  // Variante de withCustomers para un unico pedido.
  private async withCustomer(order: Order): Promise<OrderWithCustomer> {
    const [enriched] = await this.withCustomers([order]);
    return enriched!;
  }

  // El cliente crea pedidos a su nombre; el owner los crea a nombre del cliente
  // indicado en customer_id (no tiene perfil de cliente ni carrito propio).
  async createOrder(
    userId: string,
    role: string,
    input: {
      customer_id?: unknown;
      delivery_type?: unknown;
      delivery_address?: unknown;
      items?: unknown;
    },
  ): Promise<OrderWithCustomer> {
    const isOwner = role === "owner";
    let customerId: string;
    let customer: Customer | null = null;

    // La forma de los items se valida antes de tocar ninguna base.
    const inputItems = this.parseItems(input.items);

    if (isOwner) {
      // El owner no tiene perfil de cliente: el pedido va a nombre del customer_id indicado.
      customer = await this.customerRepository.getById(requireId(input.customer_id, "customer_id"));
      if (!customer) {
        throw new ValidationError("El cliente indicado no existe");
      }
      customerId = customer.id;

      // El owner no tiene carrito y no debe consumir el del cliente: items es obligatorio.
      if (inputItems.length === 0) {
        throw new ValidationError("Debe indicar los productos del pedido");
      }
    } else {
      // Un cliente no puede crear pedidos a nombre de otro: se ignora input.customer_id.
      customerId = await this.resolveCustomerId(userId);
    }

    // 1. Validar delivery_type.
    const deliveryType = this.validateDeliveryType(input.delivery_type);
    let deliveryAddress: string | null = null;

    if (deliveryType === "envio") {
      if (
        typeof input.delivery_address !== "string" ||
        input.delivery_address.trim().length === 0
      ) {
        throw new ValidationError("El campo 'delivery_address' es obligatorio para envios");
      }
      deliveryAddress = input.delivery_address.trim();
    }

    // 2. Determinar items: del input o, si no vino ninguno, del carrito del customer.
    let rawItems: ItemInput[];
    let fromCart = false;

    if (inputItems.length > 0) {
      rawItems = inputItems;
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

    // 3.b. Consolidar cantidades por product_id antes de validar.
    // Si el mismo producto viene repetido, se valida y descuenta una sola vez por
    // el total acumulado; validar item por item dejaba pasar pedidos que superaban
    // el stock disponible y lo dejaban en negativo.
    const merged = new Map<string, number>();
    for (const raw of rawItems) {
      if (!Number.isInteger(raw.quantity) || raw.quantity <= 0) {
        throw new ValidationError("La cantidad de cada item debe ser un entero mayor a 0");
      }
      merged.set(raw.product_id, (merged.get(raw.product_id) ?? 0) + raw.quantity);
    }

    // 4. Validar cada item consolidado contra el producto.
    const orderItems: {
      product_id: string;
      product_name: string;
      unit_price: number | null;
      quantity: number;
      type: string;
    }[] = [];

    let total = 0;

    for (const [productId, quantity] of merged) {
      const product = await this.productRepository.getById(productId);

      if (!product || !product.is_active) {
        throw new ValidationError(`Producto no disponible: ${productId}`);
      }

      if (product.type === "stock") {
        if (quantity > product.stock) {
          throw new ValidationError(
            `Stock insuficiente para '${product.name}'. Disponible: ${product.stock}`,
          );
        }
        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity,
          type: product.type,
        });
        total += (product.price ?? 0) * quantity;
      } else {
        // Producto tipo "encargo": unit_price null.
        orderItems.push({
          product_id: product.id,
          product_name: product.name,
          unit_price: null,
          quantity,
          type: product.type,
        });
      }
    }

    // Recuperar el perfil si solo se resolvio su id (cliente web).
    customer ??= await this.customerRepository.getById(customerId);
    if (!customer) {
      throw new ValidationError("No existe un perfil de cliente para este usuario");
    }
    this.assertCanBeContacted(
      customer,
      isOwner,
      orderItems.some((item) => item.type === "encargo"),
    );

    // 5. Descontar stock de productos tipo stock con la operacion atomica del repo.
    // La validacion del paso 4 es solo para dar un mensaje de error util: la
    // condicion real de stock la aplica decrementStock en la misma escritura, asi
    // dos pedidos simultaneos no pueden llevarse la misma unidad.
    // deuda técnica: no transaccional (Postgres orders + Mongo products); si un
    // descuento falla a mitad de camino, se revierte a mano lo ya descontado.
    const descontados: { product_id: string; quantity: number }[] = [];

    for (const item of orderItems) {
      if (item.type !== "stock") continue;

      const ok = await this.productRepository.decrementStock(item.product_id, item.quantity);
      if (!ok) {
        for (const hecho of descontados) {
          await this.productRepository.incrementStock(hecho.product_id, hecho.quantity);
        }
        throw new ValidationError(`Stock insuficiente para '${item.product_name}'`);
      }
      descontados.push({ product_id: item.product_id, quantity: item.quantity });
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

    // 8. Si los items vinieron del carrito, vaciarlo. Nunca pasa con el owner:
    // sus pedidos siempre traen los items en el input.
    if (fromCart) {
      const cart = await this.cartRepository.getByCustomerId(customerId);
      if (cart) {
        await this.cartRepository.clear(cart.id);
      }
    }

    return this.withCustomer(order);
  }

  async getMyOrders(userId: string): Promise<OrderWithCustomer[]> {
    const customerId = await this.resolveCustomerId(userId);
    return this.withCustomers(await this.orderRepository.getByCustomerId(customerId));
  }

  async getAllOrders(statusFilter?: string): Promise<OrderWithCustomer[]> {
    return this.withCustomers(await this.orderRepository.getAll(statusFilter));
  }

  async getById(orderId: string, userId: string, role: string): Promise<OrderWithCustomer | null> {
    const order = await this.orderRepository.getById(orderId);
    if (!order) return null;

    // El owner puede ver cualquier pedido.
    if (role === "owner") return this.withCustomer(order);

    // Para otros roles, verificar que la orden pertenezca al cliente.
    const customerId = await this.resolveCustomerId(userId);
    if (order.customer_id !== customerId) {
      throw new ForbiddenError("No tiene permiso para ver este pedido");
    }

    return this.withCustomer(order);
  }

  // Avanza el estado de la orden un paso en el flujo lineal (owner).
  // La transicion se aplica solo si el pedido sigue en el estado que se valido: dos avances
  // simultaneos no se pisan, ni se avanza un pedido que otro request acaba de cancelar.
  async changeStatus(orderId: string, newStatus: OrderStatus): Promise<Order | null> {
    const order = await this.orderRepository.getById(orderId);
    if (!order) return null;

    // No se puede cambiar el estado de una orden cancelada.
    if (order.status === "cancelado") {
      throw new ValidationError("No se puede cambiar el estado de una orden cancelada");
    }

    // Validar que newStatus sea un estado válido del flujo.
    const newIndex = FLUJO.indexOf(newStatus);
    if (newIndex === -1) {
      throw new ValidationError("Estado no válido");
    }

    // Solo permitir avanzar exactamente un paso.
    const currentIndex = FLUJO.indexOf(order.status);
    if (newIndex !== currentIndex + 1) {
      throw new ValidationError("Transición de estado no permitida");
    }

    const updated = await this.orderRepository.updateStatusIf(orderId, [order.status], newStatus);
    if (!updated) {
      throw new ValidationError(CAMBIO_CONCURRENTE);
    }
    return updated;
  }

  // Cancela la orden. El owner puede cancelar cualquier pedido que no este entregado
  // ni cancelado; el cliente solo los propios y mientras esten pendientes.
  async cancelOrder(orderId: string, userId: string, role: string): Promise<Order | null> {
    const isOwner = role === "owner";
    let order: Order | null;

    if (isOwner) {
      // El owner no tiene perfil de cliente: no se resuelve customer.
      order = await this.orderRepository.getById(orderId);
      if (!order) return null;
    } else {
      const customerId = await this.resolveCustomerId(userId);
      order = await this.orderRepository.getById(orderId);
      if (!order) return null;

      // Verificar que la orden pertenezca al customer. Es un problema de permisos,
      // no de validacion: mismo criterio que getById, el controller lo mapea a 403.
      if (order.customer_id !== customerId) {
        throw new ForbiddenError("No puede cancelar un pedido de otro cliente");
      }
    }

    // Chequeo previo: da el mensaje de error sin intentar la escritura.
    const rechazo = this.cancelRejection(order.status, isOwner);
    if (rechazo) throw rechazo;

    // La condicion real va en la escritura: updateStatusIf solo cancela si el pedido sigue
    // en un estado cancelable. De varias cancelaciones simultaneas, una sola obtiene el
    // pedido; las demas reciben null y no reponen stock.
    const from = isOwner ? CANCELABLE_POR_OWNER : CANCELABLE_POR_CLIENTE;
    const updated = await this.orderRepository.updateStatusIf(orderId, from, "cancelado");

    if (!updated) {
      // Otro request cambio el estado entre la lectura y la escritura: se informa segun
      // el estado en que quedo.
      const current = await this.orderRepository.getById(orderId);
      if (!current) return null;
      throw (
        this.cancelRejection(current.status, isOwner) ?? new ValidationError(CAMBIO_CONCURRENTE)
      );
    }

    // Reponer stock de productos tipo stock (operación inversa al descuento en createOrder).
    // Primero se marca "cancelado" y despues se repone, y solo lo hace el request que
    // efectivamente cambio el estado: asi el stock se repone una unica vez.
    // deuda técnica: no transaccional (Postgres orders + Mongo products). Si la reposicion
    // falla a mitad de camino, el pedido queda cancelado con stock de menos (nunca de mas):
    // es el lado seguro, pero hay que corregir el stock a mano.
    for (const item of updated.items) {
      if (item.type === "stock") {
        await this.productRepository.incrementStock(item.product_id, item.quantity);
      }
    }

    return updated;
  }

  // Error por el que no se puede cancelar un pedido en `status`, o null si se puede.
  private cancelRejection(status: OrderStatus, isOwner: boolean): ValidationError | null {
    if (isOwner) {
      if (status === "entregado") {
        return new ValidationError("No se puede cancelar un pedido ya entregado");
      }
      if (status === "cancelado") {
        return new ValidationError("El pedido ya está cancelado");
      }
      return null;
    }
    if (status !== "pendiente") {
      return new ValidationError("Solo se puede cancelar un pedido pendiente");
    }
    return null;
  }

  // Valida la forma de input.items. Ausente => lista vacia (el cliente usa su carrito).
  // Cada product_id pasa por requireId: un objeto como { "$gt": "" } llegaria a Mongo
  // como operador y matchearia el primer producto que encuentre.
  private parseItems(value: unknown): ItemInput[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new ValidationError("El campo 'items' debe ser una lista");
    }

    return value.map((raw: unknown) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new ValidationError(ITEM_INVALIDO);
      }
      const { product_id, quantity } = raw as Record<string, unknown>;
      if (product_id === undefined || quantity === undefined) {
        throw new ValidationError(ITEM_INVALIDO);
      }
      const productId = requireId(product_id, "product_id");
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
        throw new ValidationError("La cantidad de cada item debe ser un entero mayor a 0");
      }
      return { product_id: productId, quantity };
    });
  }

  // Los pedidos web siempre requieren telefono; en mostrador, solo los encargos
  // que se cotizan por WhatsApp. Basta un digito, sin exigir documento ni condicion fiscal.
  private assertCanBeContacted(customer: Customer, isOwner: boolean, hasEncargo: boolean): void {
    if (/\d/.test(customer.phone ?? "")) return;

    if (!isOwner) {
      throw new ValidationError("Completá tu teléfono en Mi perfil para poder confirmar el pedido");
    }
    if (hasEncargo) {
      throw new ValidationError(
        "El cliente no tiene teléfono cargado y el pedido incluye productos por encargo, que se cotizan por WhatsApp",
      );
    }
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
