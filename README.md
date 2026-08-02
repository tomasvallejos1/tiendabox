# TiendaBox

API REST para la gestión de una tienda de productos electrónicos. Trabajo final de la materia **Desarrollo de Software** — UTN FRVT, 2026.

---

## El problema que resuelve

Una tienda de productos electrónicos opera de forma manual: los pedidos se reciben por mensajería, el catálogo no es visible para el cliente, y no hay trazabilidad del estado de los pedidos. TiendaBox digitaliza esa operación resolviendo dos particularidades concretas del negocio:

1. **Productos en stock y por encargo en el mismo catálogo.** Los productos de tipo `stock` tienen precio y cantidad definidos; los de tipo `encargo` no tienen precio hasta que el dueño lo consulta con el proveedor (precio `null`, stock forzado a `0`). Todo el sistema — validaciones, carrito, pedidos — respeta esa distinción con reglas diferenciadas.

2. **Dos perfiles con permisos diferenciados.**
   - **Cliente:** explora el catálogo público, arma un carrito, genera pedidos y sigue su estado.
   - **Dueño (owner):** administra categorías, marcas y productos; gestiona los pedidos avanzando su estado paso a paso.

---

## Cómo levantarlo

### Requisitos previos

- **Node.js** ≥ 22, < 23
- **Docker** y **Docker Compose**

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tomasvallejos1/tiendabox.git
cd tiendabox

# 2. Copiar las variables de entorno
cp .env.example .env

# 3. Levantar las bases de datos con Docker
docker compose up -d
```

Esto levanta:
- **MongoDB** en el puerto `27018` (contenedor `tiendabox-mongodb`)
- **PostgreSQL** en el puerto `5432` (contenedor `tiendabox-postgres`)

```bash
# 4. Instalar dependencias
npm install

# 5. Arrancar en modo desarrollo
npm run dev
```

La API queda disponible en:
- **API:** http://localhost:3000
- **Documentación Swagger:** http://localhost:3000/api-docs

---

## Funcionalidades

### Público (sin autenticación)
- Consultar categorías, marcas y productos (con filtros por categoría y marca).

### Cliente
- Registrarse y loguearse.
- Ver y editar su perfil de cliente.
- Agregar y eliminar productos del carrito, vaciar el carrito.
- Crear pedidos (desde el carrito o con items explícitos), eligiendo retiro o envío.
- Consultar sus pedidos y cancelar los que estén en estado pendiente.

### Dueño (owner)
- Crear, editar y eliminar categorías, marcas y productos.
- Listar todos los clientes y pedidos (con filtro por estado).
- Avanzar el estado de los pedidos en el flujo: `pendiente → confirmado → en_preparacion → listo_para_retirar → entregado`.

---

## Stack tecnológico

| Tecnología   | Versión       | Rol                                  |
|-------------|---------------|--------------------------------------|
| Node.js     | ≥ 22, < 23    | Runtime                              |
| TypeScript  | ^6.0.3        | Lenguaje (tipado estricto)           |
| Express     | ^5.2.1        | Framework HTTP                       |
| PostgreSQL  | 15 (Docker)   | Personas y transacciones             |
| MongoDB     | 6.0 (Docker)  | Catálogo de productos                |
| Vitest      | ^4.1.9        | Tests unitarios                      |
| Docker      | —             | Infraestructura de bases de datos    |

---

## Arquitectura

Cada recurso sigue un patrón por capas con inversión de dependencias:

| Capa                        | Archivo                        | Responsabilidad                                                  |
|----------------------------|--------------------------------|------------------------------------------------------------------|
| **Entidad**                | `*.entity.ts`                  | Tipos puros de TypeScript. Sin lógica.                           |
| **Interfaz de repositorio**| `*.repository.interface.ts`    | Contrato de persistencia. Define qué operaciones existen.        |
| **Repositorio concreto**   | `*.repository.{mongodb,postgres}.ts` | Implementación contra un motor específico.                |
| **Servicio**               | `*.service.ts`                 | Reglas de negocio y validaciones. Solo depende de la interfaz.   |
| **Controlador**            | `*.controller.ts`              | Mapea Request/Response HTTP a llamadas del servicio.             |
| **Rutas**                  | `*.routes.ts`                  | Define endpoints Express y aplica middlewares de seguridad.      |

La clase `DatabaseProviderFactory` (`src/db/database-provider.factory.ts`) centraliza la creación de todos los repositorios y las conexiones a ambas bases. La inyección de dependencias se hace manualmente en `src/app.ts`, sin frameworks de DI.

---

## Las dos bases de datos

El proyecto usa dos motores de base de datos de forma simultánea, con un criterio de división deliberado:

| Motor      | Datos que almacena                          | Justificación                                                                                     |
|-----------|--------------------------------------------|----------------------------------------------------------------------------------------------------|
| **MongoDB**    | Category, Brand, Product                   | Esquema flexible para un catálogo con campos nullable según el tipo de producto (`price` es `null` en productos por encargo). |
| **PostgreSQL** | User, Customer, Session, Cart, Order       | Datos relacionales con integridad referencial (foreign keys entre users, customers, carts, orders). |

Los IDs son UUID generados en la aplicación con `crypto.randomUUID()`, de forma que ambos motores usan el mismo formato de identificador (string de 36 caracteres).

Al arrancar, la aplicación ejecuta automáticamente `src/db/sql/init.sql`, que crea las tablas de PostgreSQL con `CREATE TABLE IF NOT EXISTS` y precarga un usuario owner.

---

## Estructura del proyecto

```
src/
├── app.ts                 # Composición principal: Express, inyección de dependencias, montaje de rutas
├── init.ts                # Punto de entrada (crea App y llama a start)
├── config.ts              # Lectura de variables de entorno con valores por defecto
├── errors.ts              # Errores de dominio: ValidationError (400), ConflictError (409)
├── docs/                  # Especificación OpenAPI 3.0 para Swagger UI
├── middlewares/           # authenticate (token de sesión) y authorize (por rol)
├── db/                    # DatabaseProviderFactory y script SQL de inicialización
├── auth/                  # Registro, login, logout
├── user/                  # CRUD de usuarios (sin guards)
├── customer/              # Perfil de cliente (CUIT, condición fiscal, dirección)
├── category/              # Categorías del catálogo (MongoDB)
├── brand/                 # Marcas del catálogo (MongoDB)
├── product/               # Productos: stock vs encargo, soft-delete (MongoDB)
├── cart/                  # Carrito de compras (PostgreSQL)
├── order/                 # Pedidos con máquina de estados (PostgreSQL)
└── session/               # Sesiones de autenticación (PostgreSQL)
```

---

## Autenticación

El sistema usa un esquema de **token opaco de sesión** (no JWT), una decisión deliberada de simplicidad acordada con la cátedra.

### Flujo

1. **Registro:** `POST /api/auth/register` crea un usuario con rol `cliente` y su perfil de Customer asociado.
2. **Login:** `POST /api/auth/login` valida las credenciales y devuelve un token opaco. El token se guarda en la tabla `sessions` de PostgreSQL con una validez de **24 horas**.
3. **Uso:** El token se envía en el header `Authorization` como `Bearer <token>`.
4. **Logout:** `POST /api/auth/logout` elimina la sesión del token enviado.

### Usuario owner precargado

El script `init.sql` inserta automáticamente un usuario con rol `owner` para poder probar las funciones de administración desde el primer momento:

| Campo      | Valor                    |
|-----------|--------------------------|
| Email     | `admin@tiendabox.com`    |
| Password  | `admin123`               |
| Rol       | `owner`                  |

---

## Endpoints

### Auth

| Método | Ruta                   | Descripción                                  | Permiso  |
|--------|------------------------|----------------------------------------------|----------|
| POST   | `/api/auth/register`   | Registrar usuario + perfil de cliente         | Público  |
| POST   | `/api/auth/login`      | Login y obtención de token de sesión          | Público  |
| POST   | `/api/auth/logout`     | Cerrar sesión (eliminar token)                | Público  |

### Users

| Método | Ruta              | Descripción                 | Permiso  |
|--------|-------------------|-----------------------------|----------|
| GET    | `/api/users`      | Listar todos los usuarios   | Sin guards |
| GET    | `/api/user/:id`   | Obtener usuario por ID      | Sin guards |
| POST   | `/api/user`       | Crear un usuario            | Sin guards |
| PUT    | `/api/user/:id`   | Actualizar un usuario       | Sin guards |
| DELETE | `/api/user/:id`   | Eliminar un usuario         | Sin guards |

### Customers

| Método | Ruta                  | Descripción                  | Permiso         |
|--------|-----------------------|------------------------------|-----------------|
| GET    | `/api/customers`      | Listar todos los clientes    | Owner           |
| GET    | `/api/customer/:id`   | Obtener cliente por ID       | Autenticado     |
| POST   | `/api/customer`       | Crear un cliente             | Sin guards      |
| PUT    | `/api/customer/:id`   | Actualizar un cliente        | Autenticado     |
| DELETE | `/api/customer/:id`   | Eliminar un cliente          | Owner           |

### Categories

| Método | Ruta                   | Descripción                    | Permiso  |
|--------|------------------------|--------------------------------|----------|
| GET    | `/api/categories`      | Listar todas las categorías    | Público  |
| GET    | `/api/category/:id`    | Obtener categoría por ID       | Público  |
| POST   | `/api/category`        | Crear una categoría            | Owner    |
| PUT    | `/api/category/:id`    | Actualizar una categoría       | Owner    |
| DELETE | `/api/category/:id`    | Eliminar una categoría         | Owner    |

### Brands

| Método | Ruta               | Descripción                | Permiso  |
|--------|--------------------|-----------------------------|----------|
| GET    | `/api/brands`      | Listar todas las marcas     | Público  |
| GET    | `/api/brand/:id`   | Obtener marca por ID        | Público  |
| POST   | `/api/brand`       | Crear una marca             | Owner    |
| PUT    | `/api/brand/:id`   | Actualizar una marca        | Owner    |
| DELETE | `/api/brand/:id`   | Eliminar una marca          | Owner    |

### Products

| Método | Ruta                | Descripción                                       | Permiso  |
|--------|---------------------|----------------------------------------------------|----------|
| GET    | `/api/products`     | Listar productos (filtros: `category_id`, `brand_id`) | Público  |
| GET    | `/api/product/:id`  | Obtener producto por ID (con nombre de categoría y marca) | Público  |
| POST   | `/api/product`      | Crear un producto                                  | Owner    |
| PUT    | `/api/product/:id`  | Actualizar un producto                             | Owner    |
| DELETE | `/api/product/:id`  | Eliminar un producto (soft-delete)                 | Owner    |

### Cart

| Método | Ruta                         | Descripción                                | Permiso  |
|--------|------------------------------|--------------------------------------------|----------|
| GET    | `/api/cart`                  | Obtener el carrito del cliente autenticado  | Cliente  |
| POST   | `/api/cart/items`            | Agregar un item al carrito                 | Cliente  |
| DELETE | `/api/cart/items/:productId` | Eliminar un item del carrito               | Cliente  |
| DELETE | `/api/cart`                  | Vaciar el carrito                          | Cliente  |

### Orders

| Método | Ruta                       | Descripción                                     | Permiso     |
|--------|----------------------------|--------------------------------------------------|-------------|
| POST   | `/api/order`               | Crear un pedido (desde carrito o con items)       | Cliente     |
| GET    | `/api/orders/mine`         | Listar los pedidos del cliente autenticado        | Cliente     |
| GET    | `/api/orders`              | Listar todos los pedidos (filtro: `status`)       | Owner       |
| GET    | `/api/order/:id`           | Obtener un pedido por ID                          | Autenticado |
| PUT    | `/api/order/:id/status`    | Avanzar el estado del pedido (un paso)            | Owner       |
| PUT    | `/api/order/:id/cancel`    | Cancelar un pedido propio si está pendiente       | Cliente     |

---

## Scripts disponibles

| Script            | Comando              | Descripción                                    |
|-------------------|----------------------|-------------------------------------------------|
| `dev`             | `npm run dev`        | Inicia el servidor con nodemon + ts-node        |
| `build`           | `npm run build`      | Compila TypeScript a JavaScript (`dist/`)       |
| `start`           | `npm start`          | Ejecuta la build compilada (`dist/init.js`)     |
| `format`          | `npm run format`     | Formatea el código con Prettier                 |
| `lint`            | `npm run lint`       | Ejecuta ESLint sobre `src/`                     |
| `test`            | `npm test`           | Ejecuta los tests unitarios con Vitest          |

---

## Cómo probar

### Swagger UI

Documentación interactiva disponible en http://localhost:3000/api-docs con todos los endpoints, schemas y ejemplos.

### Archivos `.http` (VS Code REST Client)

En `tests/http/` hay un archivo por recurso para probar cada endpoint directamente desde VS Code. **Requiere la extensión [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)** — si no la tenés instalada, usá Swagger UI en su lugar.

```
tests/http/
├── auth.http
├── brand.http
├── cart.http
├── category.http
├── customer.http
├── order.http
├── product.http
└── user.http
```

### Colección de Bruno

En `tests/bruno/tiendabox-api/` hay una colección para el cliente [Bruno](https://www.usebruno.com/) con requests organizados por recurso.

### Tests unitarios

```bash
npm test
```

Ejecuta los tests unitarios con Vitest. Actualmente cubre los filtros del servicio de productos (`ProductService.getAll`) con un repositorio fake en memoria.

---

## Decisiones de diseño y deuda técnica

| Decisión / Deuda                                    | Detalle                                                                                                                                                  |
|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Contraseñas en texto plano**                       | Decisión de simplicidad acordada con la cátedra. Pendiente de refactor con hash (bcrypt o similar).                                                      |
| **Token opaco en base en lugar de JWT**              | Menos dependencias, misma funcionalidad para el alcance del TP. El token se guarda en la tabla `sessions` con expiración de 24 hs.                       |
| **Descuento de stock no transaccional**              | Al crear un pedido se descuenta stock de productos en MongoDB y se crea la orden en PostgreSQL. Al ser motores distintos, no hay transacción atómica.     |
| **Reposición de stock al cancelar: pendiente**       | Al cancelar un pedido no se repone el stock descontado. Marcado como TODO en el código.                                                                  |
| **Congelamiento de nombre y precio en order_items**   | Los items del pedido guardan `product_name` y `unit_price` al momento de la compra, de forma que un cambio de precio posterior no altere pedidos pasados. |
| **Soft-delete de productos**                         | Los productos no se eliminan físicamente; se marcan con `is_active: false` y se excluyen de las consultas del catálogo.                                  |

---

## Autores

- **Tomás Vallejos**
- **Lautaro Landriel**
- **Pedro Borda Bossana**

Materia: Desarrollo de Software — UTN FRVT, 2026.
