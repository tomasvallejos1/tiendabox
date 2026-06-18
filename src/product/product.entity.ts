// Tipo del dato Product. Sin logica.
export type ProductType = "stock" | "encargo";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  type: ProductType;
  price: number | null;
  stock: number;
  category_id: string;
  brand_id: string;
  is_active: boolean;
}
