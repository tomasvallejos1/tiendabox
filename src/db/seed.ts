import { loadConfig } from "../config";
import { DatabaseProviderFactory } from "./database-provider.factory";
import { CategoryService } from "../category/category.service";
import { BrandService } from "../brand/brand.service";
import { ProductService } from "../product/product.service";
import { UserService } from "../user/user.service";
import { CustomerService } from "../customer/customer.service";
import {
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_OWNERS,
  SEED_PASSWORD,
  SEED_PRODUCTS,
} from "./seed-data";

// Carga datos de ejemplo en PostgreSQL y MongoDB usando los mismos servicios que la API,
// asi pasan por las mismas validaciones. Es idempotente: lo que ya existe (por email o
// nombre) se saltea, salvo que le falte la imagen/logo, que se completa. Se puede correr
// varias veces.
async function seed(): Promise<void> {
  const factory = new DatabaseProviderFactory(loadConfig());
  await factory.connect();

  const userRepository = factory.createUserRepository();
  const categoryRepository = factory.createCategoryRepository();
  const brandRepository = factory.createBrandRepository();
  const productRepository = factory.createProductRepository();
  const customerRepository = factory.createCustomerRepository();
  const runInTransaction = factory.createTransaction();

  await categoryRepository.createIndexes();

  const userService = new UserService(userRepository, customerRepository, runInTransaction);
  const customerService = new CustomerService(customerRepository, userRepository, runInTransaction);
  const categoryService = new CategoryService(categoryRepository, productRepository);
  const brandService = new BrandService(brandRepository, productRepository);
  const productService = new ProductService(productRepository, categoryRepository, brandRepository);

  for (const owner of SEED_OWNERS) {
    if (await userRepository.getByEmail(owner.email)) continue;
    await userService.create({ ...owner, role: "owner" });
    console.log(`Owner creado: ${owner.email}`);
  }

  for (const { email, ...profile } of SEED_CUSTOMERS) {
    if (await userRepository.getByEmail(email)) continue;
    await customerService.create({ ...profile, email, password: SEED_PASSWORD });
    console.log(`Cliente creado: ${email}`);
  }

  const categoryIds = new Map<string, string>();
  for (const data of SEED_CATEGORIES) {
    const existing = await categoryRepository.getByName(data.name);
    const category = existing ?? (await categoryService.create(data));
    categoryIds.set(data.name, category.id);
    if (!existing) console.log(`Categoría creada: ${data.name}`);
  }

  const brandIds = new Map<string, string>();
  for (const data of SEED_BRANDS) {
    const existing = await brandRepository.getByName(data.name);
    const brand = existing ?? (await brandService.create(data));
    brandIds.set(data.name, brand.id);
    if (!existing) console.log(`Marca creada: ${data.name}`);
    else if (!existing.logo_url && data.logo_url) {
      await brandService.update(existing.id, { logo_url: data.logo_url });
      console.log(`Logo agregado: ${data.name}`);
    }
  }

  const existingProducts = await productRepository.getAll();
  const existingByName = new Map(existingProducts.map((product) => [product.name, product]));
  for (const { category, brand, ...data } of SEED_PRODUCTS) {
    const existing = existingByName.get(data.name);
    if (existing) {
      // Productos sembrados antes de que el seed tuviera imagenes: se les completa la imagen.
      if (!existing.image_url && data.image_url) {
        await productService.update(existing.id, { image_url: data.image_url });
        console.log(`Imagen agregada: ${data.name}`);
      }
      continue;
    }
    await productService.create({
      ...data,
      category_id: categoryIds.get(category),
      brand_id: brandIds.get(brand),
    });
    console.log(`Producto creado: ${data.name}`);
  }

  console.log("Seed completado.");
  console.log(`Contraseña de las cuentas sembradas: ${SEED_PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("No se pudo ejecutar el seed:", error);
    process.exit(1);
  });
