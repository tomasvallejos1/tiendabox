import { ProductType } from "../product/product.entity";

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

// Cart item enriched with product data (API response, not persisted).
export interface CartItemDetail {
  id: string;
  product_id: string;
  quantity: number;
  name: string | null; // null if the product no longer exists
  type: ProductType | null;
  unit_price: number | null; // null for "encargo" or unavailable products
  stock_available: number | null; // null for "encargo" or unavailable products
  subtotal: number | null; // unit_price * quantity; null when not applicable
  available: boolean; // false if discontinued or missing
  exceeds_stock: boolean; // true if "stock" type and quantity exceeds current stock
}

// Self-contained cart returned by the cart endpoints.
export interface CartDetail {
  id: string;
  customer_id: string;
  updated_at: string;
  items: CartItemDetail[];
  item_count: number; // sum of quantities (frontend badge)
  total: number; // subtotals of available "stock" items
  has_encargo_items: boolean;
  has_unavailable_items: boolean;
}
