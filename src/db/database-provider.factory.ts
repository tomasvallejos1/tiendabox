import { Db, MongoClient } from "mongodb";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { AppConfig } from "../config";
import { ICategoryRepository } from "../category/category.repository.interface";
import { CategoryRepositoryMongoDB } from "../category/category.repository.mongodb";
import { IProductRepository } from "../product/product.repository.interface";
import { ProductRepositoryMongoDB } from "../product/product.repository.mongodb";
import { IBrandRepository } from "../brand/brand.repository.interface";
import { BrandMongoRepository } from "../brand/brand.repository.mongodb";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { CustomerMongoRepository } from "../customer/customer.repository.mongodb";
import { IUserRepository } from "../user/user.repository.interface";
import { UserRepositoryPostgres } from "../user/user.repository.postgres";

// Centraliza la creacion de repositorios y las conexiones a las bases.
// Preparado para sumar PostgreSQL mas adelante.
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

    this.pgPool = new Pool({
      host: this.config.postgres.host,
      port: this.config.postgres.port,
      user: this.config.postgres.user,
      password: this.config.postgres.password,
      database: this.config.postgres.db,
    });

    const sqlPath = path.join(__dirname, "sql", "init.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    await this.pgPool.query(sql);
  }

  createCategoryRepository(): ICategoryRepository {
    return new CategoryRepositoryMongoDB(this.getDb());
  }

  createProductRepository(): IProductRepository {
    return new ProductRepositoryMongoDB(this.getDb());
  }

  createBrandRepository(): IBrandRepository {
    return new BrandMongoRepository(this.getDb());
  }

  createCustomerRepository(): ICustomerRepository {
    return new CustomerMongoRepository(this.getDb());
  }

  createUserRepository(): IUserRepository {
    return new UserRepositoryPostgres(this.getPgPool());
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
