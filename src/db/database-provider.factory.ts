import { Pool } from 'pg';
import { Db, MongoClient } from "mongodb";
import { AppConfig } from "../config";
import { ICategoryRepository } from "../category/category.repository.interface";
import { CategoryRepositoryMongoDB } from "../category/category.repository.mongodb";
import { IProductRepository } from "../product/product.repository.interface";
import { ProductRepositoryMongoDB } from "../product/product.repository.mongodb";
import { IBrandRepository } from "../brand/brand.repository.interface";
import { BrandRepositoryMongoDB } from "../brand/brand.repository.mongodb";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { CustomerRepositoryPostgres } from '../customer/customer.repository.postgres';
import { CustomerMongoRepository } from '../customer/customer.repository.mongodb';

// Centraliza la creacion de repositorios y las conexiones a las bases.
// Soporta MongoDB para catalogo y PostgreSQL para Customer cuando corresponde.
export class DatabaseProviderFactory {
  private readonly mongoClient: MongoClient;
  private mongoDb: Db | null = null;
private pgPool: Pool | null = null;
  constructor(private readonly config: AppConfig) {
    this.mongoClient = new MongoClient(this.config.mongo.uri);
  }

  // Abre las conexiones necesarias segun el motor configurado.
  async connect(): Promise<void> {
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db(this.config.mongo.db);
    this.pgPool = new Pool(this.config.postgres);
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
    if (this.config.dbEngine === "postgres") {
      return new CustomerRepositoryPostgres(this.getPgPool());
    }
    return new CustomerMongoRepository(this.getDb());
  }

  public getDb(): Db {
    if (!this.mongoDb) {
      throw new Error("La conexion a MongoDB no fue inicializada. Llama a connect() primero.");
    }
    return this.mongoDb;
  }
  public getPgPool(): Pool {
    if (!this.pgPool) {
      throw new Error("La conexion a PostgreSQL no fue inicializada. Llama a connect() primero.");
    }
    return this.pgPool;
  }
  // Cierra las conexiones abiertas.
  async close(): Promise<void> {
    await this.mongoClient.close();
    if (this.pgPool) {
      await this.pgPool.end();
    }
  }
}
