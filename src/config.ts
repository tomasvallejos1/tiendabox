import dotenv from "dotenv";

// Carga las variables de .env a process.env
dotenv.config();

// Configuracion de la aplicacion leida desde el entorno
export interface AppConfig {
  port: number;
  dbEngine: "mongodb" | "postgres";
  mongo: {
    uri: string;
    db: string;
  };
  postgres: {
    host: string;
    port: number;
    user: string;
    password: string;
    db: string;
  };
}

// Arma el objeto de configuracion a partir de process.env, con valores por defecto
export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    dbEngine: (process.env.DB_ENGINE ?? "mongodb") as "mongodb" | "postgres",
    mongo: {
      uri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
      db: process.env.MONGO_DB ?? "tiendabox_mg",
    },
    postgres: {
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? "postgres",
      password: process.env.POSTGRES_PASSWORD ?? "",
      db: process.env.POSTGRES_DB ?? "tiendabox_pg",
    },
  };
}
