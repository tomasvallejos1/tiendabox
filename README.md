# TiendaBox

[![CI (main)](https://github.com/tomasvallejos1/tiendabox/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tomasvallejos1/tiendabox/actions/workflows/ci.yml?query=branch%3Amain)
[![CI (develop)](https://github.com/tomasvallejos1/tiendabox/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/tomasvallejos1/tiendabox/actions/workflows/ci.yml?query=branch%3Adevelop)

API REST para una tienda de productos electrónicos, con catálogo público, carrito de compras y gestión de pedidos. Trabajo final de **Desarrollo de Software**, UTN FRVT, 2026.

Construida con **Node.js + TypeScript + Express**. Usa **MongoDB** para el catálogo y **PostgreSQL** para usuarios, carritos y pedidos.

- **Productos en stock y por encargo** en el mismo catálogo. Los de encargo no tienen precio (`null`) ni stock hasta que el dueño consulta al proveedor.
- **Cliente:** explora el catálogo, arma su carrito, hace pedidos (con retiro o envío) y puede cancelarlos mientras estén pendientes.
- **Dueño (owner):** administra categorías, marcas y productos, y avanza los pedidos por `pendiente → confirmado → en_preparacion → listo_para_retirar → entregado`.

---

## Puesta en marcha

### Requisitos

- **Node.js** 22.x (`>=22 <23`)
- **Docker** con Docker Compose
- **Git**

### 1. Clonar el repositorio

```bash
git clone https://github.com/tomasvallejos1/tiendabox.git
cd tiendabox
```

### 2. Crear el archivo `.env`

```bash
cp .env.example .env    # en CMD de Windows: copy .env.example .env
```

Incluye `PORT`, `CORS_ORIGIN` (el origen del frontend, por defecto `http://localhost:4200`) y las conexiones a MongoDB y PostgreSQL. Los valores ya coinciden con `docker-compose.yaml`, así que para desarrollo local no hace falta cambiar nada.

### 3. Levantar las bases de datos

Con Docker Desktop abierto:

```bash
docker compose up -d
```

| Servicio      | Contenedor           | Puerto  |
|---------------|----------------------|---------|
| MongoDB 6.0   | `tiendabox-mongodb`  | `27018` |
| PostgreSQL 15 | `tiendabox-postgres` | `5432`  |

Los datos quedan en volúmenes de Docker. Para apagar: `docker compose down` (con `-v` también se borran los datos). Si ya tenés un PostgreSQL local en el puerto `5432`, detenelo antes.

### 4. Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Al arrancar, la API crea las tablas de PostgreSQL (`src/db/sql/init.sql`) y precarga un usuario owner.

| Qué             | Dónde                                  |
|-----------------|----------------------------------------|
| API             | http://localhost:3000/api              |
| Swagger UI      | http://localhost:3000/api-docs         |
| Usuario owner   | `admin@tiendabox.com` / `admin123`     |

### Probar la API

- **Autenticación:** `POST /api/auth/register` o `POST /api/auth/login` devuelven un token de sesión, que se envía en el header `Authorization: Bearer <token>`. Con ese token, `PUT /api/auth/password` (`{ current_password, new_password }`, responde 204) cambia la contraseña del usuario logueado, sea cliente u owner, y cierra sus otras sesiones.
- **Swagger UI** (`/api-docs`): todos los endpoints, con schemas y ejemplos.
- **Archivos `.http`** en `tests/http/`, uno por recurso, para usar con la extensión [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) de VS Code.
- **Tests unitarios:** `npm run test:unit` (Jest, con repositorios fake en memoria, sin bases de datos).

### Scripts

| Script                          | Descripción                                        |
|---------------------------------|----------------------------------------------------|
| `npm run dev`                   | Servidor en modo desarrollo (nodemon + ts-node)    |
| `npm run build` / `npm start`   | Compila a `dist/` y ejecuta la build               |
| `npm test`                      | Todos los tests (`test/`)                          |
| `npm run test:unit`             | Tests unitarios (`test/unit/`)                     |
| `npm run test:integration`      | Tests de integración (requieren Docker)            |
| `npm run test:coverage`         | Tests con reporte de coverage (mínimo 80%)         |
| `npm run lint` / `npm run format` | ESLint / Prettier sobre `src/` y `test/`         |

### Flujo de trabajo

Al instalar las dependencias (`npm install`), Husky configura dos hooks de git:

| Hook         | Cuándo corre    | Qué corre                                                                                      |
|--------------|-----------------|------------------------------------------------------------------------------------------------|
| `pre-commit` | en cada commit  | `eslint --fix` y `prettier --write` sobre los `.ts` en stage (lint-staged)                     |
| `pre-push`   | en cada push    | `tsc --noEmit`, `npm run lint` y los tests unitarios con coverage; si algo falla, no se pushea |

Los tests de integración no corren en los hooks porque necesitan Docker; corren en el CI.

**Solo para emergencias** (por ejemplo, un hotfix con el CI como red de seguridad) se pueden saltear con `--no-verify`:

```bash
git commit --no-verify -m "..."
git push --no-verify
```

No es para el día a día: el código que se pushea sin verificar puede romper el build o los tests de todo el equipo. En el CI los hooks se desactivan con la variable de entorno `HUSKY=0`.

### Integración continua

Cada push y cada pull request a `main` o `develop` corre el workflow [`ci.yml`](.github/workflows/ci.yml) en GitHub Actions, con cuatro jobs en paralelo:

| Job                    | Qué verifica                                                                                                   |
|------------------------|----------------------------------------------------------------------------------------------------------------|
| **Calidad estática**   | Tipos (`tsc --noEmit`), lint y formato con Prettier, sin ejecutar código.                                      |
| **Tests unitarios**    | Los tests de `test/unit/` con el umbral de coverage de `jest.config.cjs`. El reporte se descarga como artifact desde la pestaña Actions. |
| **Tests de integración** | Los tests de `test/integration/` contra Postgres y Mongo reales, levantados con Testcontainers (Docker ya viene en el runner). |
| **Build**              | Que el proyecto compile a `dist/` con `npm run build`.                                                         |

---

## Arquitectura

### Capas

Cada recurso (`src/<recurso>/`) sigue el mismo patrón por capas:

```
routes → controller → service → repository (interfaz) → repository (MongoDB | PostgreSQL)
```

- **Routes:** definen los endpoints y aplican los middlewares de autenticación y rol.
- **Controller:** traduce la request HTTP en llamadas al servicio.
- **Service:** reglas de negocio y validaciones. Depende solo de la interfaz del repositorio.
- **Repository:** implementa la persistencia contra un motor concreto.

`DatabaseProviderFactory` (`src/db/`) abre las conexiones y crea los repositorios, y `src/app.ts` arma las dependencias a mano, sin framework de DI.

### Dos bases de datos

| Motor      | Datos                                           | Por qué                                                   |
|------------|-------------------------------------------------|-----------------------------------------------------------|
| MongoDB    | Categorías, marcas, productos                   | Esquema flexible (precio `null` en productos por encargo) |
| PostgreSQL | Usuarios, clientes, sesiones, carritos, pedidos | Datos relacionales con claves foráneas                    |

Los IDs son UUID generados en la aplicación (`crypto.randomUUID()`), con el mismo formato en ambos motores.

### Estructura

```
src/
├── app.ts, init.ts, config.ts     # Composición, punto de entrada y configuración
├── middlewares/                   # authenticate, authorize, error-handler
├── db/                            # DatabaseProviderFactory + init.sql
├── docs/                          # Especificación OpenAPI (Swagger)
├── auth/ user/ customer/ session/ # Usuarios y sesiones (PostgreSQL)
├── category/ brand/ product/      # Catálogo (MongoDB)
└── cart/ order/                   # Carrito y pedidos (PostgreSQL)
```

### Decisiones de diseño

- **Token opaco de sesión en vez de JWT:** se guarda en la tabla `sessions` y vence a las 24 h.
- **Contraseñas en texto plano:** simplificación acordada con la cátedra. Queda pendiente pasar a hash.
- **Stock entre dos motores:** al crear un pedido se descuenta el stock en MongoDB y se guarda la orden en PostgreSQL, sin una transacción común. Si algo falla a mitad de camino, se revierte lo ya descontado. Al cancelar un pedido pendiente se repone el stock.
- **Precio congelado:** los items del pedido guardan el nombre y el precio del momento de la compra.
- **Soft-delete de productos:** se marcan con `is_active: false` en lugar de borrarse.
- **Manejo de errores:** cada controller atrapa sus propios errores. Migrarlos a `next(error)` y al middleware global es un refactor pendiente.

---

## Autores

Tomás Vallejos · Lautaro Landriel · Pedro Borda Bossana. Desarrollo de Software, UTN FRVT, 2026.
