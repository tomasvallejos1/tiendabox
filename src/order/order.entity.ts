// Tipos del pedido. Sin logica.
export type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "en_preparacion"
  | "listo_para_retirar"
  | "entregado"
  | "cancelado";

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  unit_price: number | null;
  quantity: number;
  type: string;
}

export interface Order {
  id: string;
  customer_id: string;
  status: OrderStatus;
  delivery_type: string;
  delivery_address: string | null;
  total: number;
  created_at: string;
  items: OrderItem[];
}

// Datos del cliente que acompañan al pedido en la respuesta.
export interface OrderCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  government_id: string | null;
  tax_status: string;
}

export interface OrderWithCustomer extends Order {
  customer: OrderCustomer | null; // null si el cliente fue eliminado
}
