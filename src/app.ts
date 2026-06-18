import express, { Express } from "express";
import { AppConfig, loadConfig } from "./config";
import { DatabaseProviderFactory } from "./db/database-provider.factory";
import { CategoryService } from "./category/category.service";
import { CategoryController } from "./category/category.controller";
import { createCategoryRoutes } from "./category/category.routes";
import { ProductService } from "./product/product.service";
import { ProductController } from "./product/product.controller";
import { createProductRoutes } from "./product/product.routes";
import { createCustomerRouter } from './customer/customer.routes';
// ...

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

    const productRepository = this.factory.createProductRepository();
    const productService = new ProductService(productRepository);
    const productController = new ProductController(productService);

    this.app.use("/api", createProductRoutes(productController));
    this.app.use('/api/customer', createCustomerRouter(this.factory.getDb()));
  }
}
