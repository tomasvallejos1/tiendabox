import { Db, MongoClient } from "mongodb";
import { MongoDBContainer } from "@testcontainers/mongodb";
import type { StartedMongoDBContainer } from "@testcontainers/mongodb";
import { CategoryRepositoryMongoDB } from "../../src/category/category.repository.mongodb";
import { validCategory } from "../fixtures";

describe("CategoryRepositoryMongoDB — integración con BD real", () => {
  let mongoClient: MongoClient | undefined;
  let db: Db;
  let repository: CategoryRepositoryMongoDB;
  let container: StartedMongoDBContainer | undefined;

  beforeAll(async () => {
    container = await new MongoDBContainer("mongo:6.0").withStartupTimeout(120_000).start();
    // El contenedor arranca como replica set: directConnection evita que el driver intente
    // resolver el host interno del set, que no existe fuera de Docker.
    mongoClient = new MongoClient(container.getConnectionString(), { directConnection: true });
    await mongoClient.connect();
    db = mongoClient.db("tiendabox_test");
    // La app crea el indice en cada arranque: correrlo dos veces tampoco puede fallar.
    await new CategoryRepositoryMongoDB(db).createIndexes();
    await new CategoryRepositoryMongoDB(db).createIndexes();
  }, 180_000);

  // Mongo standalone no tiene un BEGIN/ROLLBACK simple: cada test arranca con la coleccion
  // vacia. deleteMany conserva los indices.
  beforeEach(async () => {
    await db.collection("categories").deleteMany({});
    repository = new CategoryRepositoryMongoDB(db);
  });

  afterAll(async () => {
    try {
      if (mongoClient) await mongoClient.close();
    } finally {
      if (container) await container.stop();
    }
  }, 60_000);

  it("guarda y recupera todos los datos con un id string", async () => {
    const saved = await repository.create(validCategory);

    expect(typeof saved.id).toBe("string");
    expect(saved.id.length).toBeGreaterThan(0);
    await expect(repository.getById(saved.id)).resolves.toEqual({ ...validCategory, id: saved.id });
    await expect(repository.getById("no-existe")).resolves.toBeNull();
  });

  it("getAll devuelve todas las categorías", async () => {
    const a = await repository.create(validCategory);
    const b = await repository.create({ name: "Monitores", description: null });

    const all = await repository.getAll();

    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));
  });

  it("getByName no distingue mayúsculas de minúsculas", async () => {
    const saved = await repository.create(validCategory);

    await expect(repository.getByName("NOTEBOOKS")).resolves.toEqual(saved);
    await expect(repository.getByName("Tablets")).resolves.toBeNull();
  });

  it("update modifica solo los campos enviados y devuelve null si no existe", async () => {
    const saved = await repository.create(validCategory);

    const updated = await repository.update(saved.id, { description: null });

    expect(updated).toEqual({ ...saved, description: null });
    await expect(repository.getById(saved.id)).resolves.toEqual(updated);
    await expect(repository.update("no-existe", { name: "X" })).resolves.toBeNull();
  });

  it("delete devuelve true la primera vez y false la segunda", async () => {
    const saved = await repository.create(validCategory);

    await expect(repository.delete(saved.id)).resolves.toBe(true);
    await expect(repository.getById(saved.id)).resolves.toBeNull();
    await expect(repository.delete(saved.id)).resolves.toBe(false);
  });

  // El indice es la garantia ante dos altas simultaneas: el chequeo previo del service con
  // getByName no alcanza si las dos pasan antes de que se inserte la primera.
  it.each(["Notebooks", "NOTEBOOKS", "notebooks"])(
    "el índice único de nombre rechaza el duplicado %s",
    async (duplicate) => {
      await repository.create(validCategory);

      await expect(repository.create({ name: duplicate, description: null })).rejects.toMatchObject(
        {
          code: 11000, // duplicate key
        },
      );
      await expect(repository.getAll()).resolves.toHaveLength(1);
    },
  );

  it("el índice único también rechaza renombrar a un nombre existente", async () => {
    await repository.create(validCategory);
    const other = await repository.create({ name: "Monitores", description: null });

    await expect(repository.update(other.id, { name: "notebooks" })).rejects.toMatchObject({
      code: 11000,
    });
    await expect(repository.getById(other.id)).resolves.toMatchObject({ name: "Monitores" });
  });
});
