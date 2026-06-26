import express, { Express } from "express";
import { AppConfig, loadConfig } from "./config";
import { DatabaseProviderFactory } from "./db/database-provider.factory";
import { CategoryService } from "./category/category.service";
import { CategoryController } from "./category/category.controller";
import { createCategoryRoutes } from "./category/category.routes";
import { BrandService } from "./brand/brand.service";
import { BrandController } from "./brand/brand.controller";
import { createBrandRoutes } from "./brand/brand.routes";
import { CustomerService } from "./customer/customer.service";
import { CustomerController } from "./customer/customer.controller";
import { createCustomerRoutes } from "./customer/customer.routes";
import { ProductService } from "./product/product.service";
import { ProductController } from "./product/product.controller";
import { createProductRoutes } from "./product/product.routes";
import { UserService } from "./user/user.service";
import { UserController } from "./user/user.controller";
import { createUserRoutes } from "./user/user.routes";
import { AuthService } from "./auth/auth.service";
import { AuthController } from "./auth/auth.controller";
import { createAuthRoutes } from "./auth/auth.routes";

// Composicion principal: crea Express, conecta la base e inyecta dependencias
// manualmente (repository -> service -> controller -> routes).
export class App {
  private readonly app: Express;
  private readonly config: AppConfig;
  private readonly factory: DatabaseProviderFactory;

  constructor() {
    this.app = express();
    this.config = loadConfig();
    this.factory = new DatabaseProviderFactory(this.config);
  }

  async start(): Promise<void> {
    await this.factory.connect();

    this.app.use(express.json());
    await this.registerRoutes();

    this.app.listen(this.config.port, () => {
      console.log(`TiendaBox escuchando en http://localhost:${this.config.port}`);
    });
  }

  // Construye la cadena de cada recurso, asegura indices y monta las rutas bajo /api.
  private async registerRoutes(): Promise<void> {
    const categoryRepository = this.factory.createCategoryRepository();
    await categoryRepository.createIndexes();
    const categoryService = new CategoryService(categoryRepository);
    const categoryController = new CategoryController(categoryService);
    this.app.use("/api", createCategoryRoutes(categoryController));

    const brandRepository = this.factory.createBrandRepository();
    const brandService = new BrandService(brandRepository);
    const brandController = new BrandController(brandService);
    this.app.use("/api", createBrandRoutes(brandController));

    const customerRepository = this.factory.createCustomerRepository();
    const customerService = new CustomerService(customerRepository);
    const customerController = new CustomerController(customerService);
    this.app.use("/api", createCustomerRoutes(customerController));

    const userRepository = this.factory.createUserRepository();
    const userService = new UserService(userRepository);
    const userController = new UserController(userService);
    this.app.use("/api", createUserRoutes(userController));

    const authService = new AuthService(userRepository, customerRepository);
    const authController = new AuthController(authService);
    this.app.use("/api", createAuthRoutes(authController));

    const productRepository = this.factory.createProductRepository();
    const productService = new ProductService(
      productRepository,
      categoryRepository,
      brandRepository,
    );
    const productController = new ProductController(productService);
    this.app.use("/api", createProductRoutes(productController));
  }
}
