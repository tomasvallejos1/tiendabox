import { Db, MongoClient } from "mongodb";
import { AppConfig } from "../config";
import { ICategoryRepository } from "../category/category.repository.interface";
import { CategoryRepositoryMongoDB } from "../category/category.repository.mongodb";
import { IProductRepository } from "../product/product.repository.interface";
import { ProductRepositoryMongoDB } from "../product/product.repository.mongodb";
import { IBrandRepository } from "../brand/brand.repository.interface";
import { BrandRepositoryMongoDB } from "../brand/brand.repository.mongodb";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { CustomerMongoRepository } from "../customer/customer.repository.mongodb";

// Centraliza la creacion de repositorios y las conexiones a las bases.
// Preparado para sumar PostgreSQL mas adelante.
export class DatabaseProviderFactory {
  private readonly mongoClient: MongoClient;
  private mongoDb: Db | null = null;

  constructor(private readonly config: AppConfig) {
    this.mongoClient = new MongoClient(this.config.mongo.uri);
  }

  // Abre las conexiones necesarias segun el motor configurado.
  async connect(): Promise<void> {
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db(this.config.mongo.db);
    // A futuro: inicializar el Pool de PostgreSQL aqui.
  }

  createCategoryRepository(): ICategoryRepository {
    return new CategoryRepositoryMongoDB(this.getDb());
  }

  createProductRepository(): IProductRepository {
    return new ProductRepositoryMongoDB(this.getDb());
  }

  createBrandRepository(): IBrandRepository {
    return new BrandRepositoryMongoDB(this.getDb());
  }

  createCustomerRepository(): ICustomerRepository {
    return new CustomerMongoRepository(this.getDb());
  }

  public getDb(): Db {
    if (!this.mongoDb) {
      throw new Error("La conexion a MongoDB no fue inicializada. Llama a connect() primero.");
    }
    return this.mongoDb;
  }

  // Cierra las conexiones abiertas.
  async close(): Promise<void> {
    await this.mongoClient.close();
  }
}
