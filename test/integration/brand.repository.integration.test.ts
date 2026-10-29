import { Db, MongoClient } from "mongodb";
import { MongoDBContainer } from "@testcontainers/mongodb";
import type { StartedMongoDBContainer } from "@testcontainers/mongodb";
import { BrandMongoRepository } from "../../src/brand/brand.repository.mongodb";
import { validBrand } from "../fixtures";

// Brand no tiene indice unico de nombre (a diferencia de Category): los duplicados solo
// los frena el chequeo con getByName del service. Por eso no hay test de duplicados aca.
describe("BrandMongoRepository — integración con BD real", () => {
  let mongoClient: MongoClient | undefined;
  let db: Db;
  let repository: BrandMongoRepository;
  let container: StartedMongoDBContainer | undefined;

  beforeAll(async () => {
    container = await new MongoDBContainer("mongo:6.0").withStartupTimeout(120_000).start();
    // El contenedor arranca como replica set: directConnection evita que el driver intente
    // resolver el host interno del set, que no existe fuera de Docker.
    mongoClient = new MongoClient(container.getConnectionString(), { directConnection: true });
    await mongoClient.connect();
    db = mongoClient.db("tiendabox_test");
  }, 180_000);

  // Mongo standalone no tiene un BEGIN/ROLLBACK simple: cada test arranca con la coleccion vacia.
  beforeEach(async () => {
    await db.collection("brands").deleteMany({});
    repository = new BrandMongoRepository(db);
  });

  afterAll(async () => {
    try {
      if (mongoClient) await mongoClient.close();
    } finally {
      if (container) await container.stop();
    }
  }, 60_000);

  it("guarda y recupera todos los datos con un id string", async () => {
    const saved = await repository.create(validBrand);

    expect(typeof saved.id).toBe("string");
    expect(saved.id.length).toBeGreaterThan(0);
    await expect(repository.getById(saved.id)).resolves.toEqual({ ...validBrand, id: saved.id });
    await expect(repository.getById("no-existe")).resolves.toBeNull();
  });

  it("una marca sin logo se recupera con logo_url null", async () => {
    const saved = await repository.create({ name: "Genérica", logo_url: null });

    await expect(repository.getById(saved.id)).resolves.toMatchObject({ logo_url: null });
  });

  it("getAll devuelve todas las marcas", async () => {
    const a = await repository.create(validBrand);
    const b = await repository.create({ name: "Logitech", logo_url: null });

    const all = await repository.getAll();

    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));
  });

  // El service usa getByName para rechazar duplicados: "lenovo" y "Lenovo" son la misma marca.
  it("getByName no distingue mayúsculas de minúsculas", async () => {
    const saved = await repository.create(validBrand);

    await expect(repository.getByName("LENOVO")).resolves.toEqual(saved);
    await expect(repository.getByName("Samsung")).resolves.toBeNull();
  });

  it("update modifica solo los campos enviados y devuelve null si no existe", async () => {
    const saved = await repository.create(validBrand);

    const updated = await repository.update(saved.id, { logo_url: null });

    expect(updated).toEqual({ ...saved, logo_url: null });
    await expect(repository.getById(saved.id)).resolves.toEqual(updated);
    await expect(repository.update("no-existe", { name: "X" })).resolves.toBeNull();
  });

  it("delete devuelve true la primera vez y false la segunda", async () => {
    const saved = await repository.create(validBrand);

    await expect(repository.delete(saved.id)).resolves.toBe(true);
    await expect(repository.getById(saved.id)).resolves.toBeNull();
    await expect(repository.delete(saved.id)).resolves.toBe(false);
  });
});
