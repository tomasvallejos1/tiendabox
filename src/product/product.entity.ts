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

// Product enriquecido con los nombres de su categoria y marca (para lecturas).
export interface ProductWithNames extends Product {
  category_name: string;
  brand_name: string;
}
