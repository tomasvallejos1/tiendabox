import type { Product } from "../src/product/product.entity";
import type { Customer } from "../src/customer/customer.entity";

// Datos de prueba compartidos entre los tests. Cada test arma sus variantes con spread,
// por ejemplo: { ...validProduct, id: "p1", stock: 0 }.

// Producto activo de tipo stock, con precio y stock disponibles.
export const validProduct: Omit<Product, "id"> = {
  name: "Producto",
  description: null,
  image_url: null,
  type: "stock",
  price: 100,
  stock: 10,
  category_id: "cat-1",
  brand_id: "brand-1",
  is_active: true,
};

// Cliente de local (sin cuenta web). Para vincularlo a una cuenta: { ...validCustomer, user_id: "user-1" }.
export const validCustomer: Omit<Customer, "id"> = {
  user_id: null,
  name: "Cliente",
  government_id: null,
  tax_status: "consumidor_final",
  phone: null,
  address: null,
  created_at: "2026-01-01T00:00:00.000Z",
};
