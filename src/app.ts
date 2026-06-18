import express, { Express } from "express";
import { AppConfig, loadConfig } from "./config";
import { DatabaseProviderFactory } from "./db/database-provider.factory";
import { CategoryService } from "./category/category.service";
import { CategoryController } from "./category/category.controller";
import { createCategoryRoutes } from "./category/category.routes";
import { createBrandRouter } from './brand/brand.routes';
import { createCustomerRouter } from './customer/customer.routes';

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
    this.registerRoutes();

    this.app.listen(this.config.port, () => {
      console.log(`TiendaBox escuchando en http://localhost:${this.config.port}`);
    });
  }

  // Construye la cadena de cada recurso y monta las rutas bajo /api.
  private registerRoutes(): void {
    const categoryRepository = this.factory.createCategoryRepository();
    const categoryService = new CategoryService(categoryRepository);
    const categoryController = new CategoryController(categoryService);
    const db = this.factory.getDb();

    this.app.use("/api", createCategoryRoutes(categoryController));
    // Montamos los routers inyectando la conexión a Mongo (db)
    this.app.use('/api/brand', createBrandRouter(db));
    this.app.use('/api/customer', createCustomerRouter(db));
  }
}
