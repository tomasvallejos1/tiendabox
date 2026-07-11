// Tipos del carrito de compras. Sin logica.
export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
}

export interface Cart {
  id: string;
  customer_id: string;
  items: CartItem[];
  updated_at: string;
}
