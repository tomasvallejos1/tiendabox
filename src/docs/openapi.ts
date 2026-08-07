// Especificación OpenAPI 3.0 de la API TiendaBox.
// Escrita a mano para evitar dependencias adicionales (swagger-jsdoc).

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "TiendaBox API",
    version: "1.0.0",
    description:
      "API REST para la gestión de una tienda de productos electrónicos. " +
      "Soporta un catálogo de productos en stock y por encargo, organizado por categorías y marcas. " +
      "Los clientes pueden armar un carrito de compras y generar pedidos con retiro o envío. " +
      "Dos roles de usuario: **cliente** (compra) y **owner** (administra catálogo y pedidos).",
  },
  servers: [{ url: "http://localhost:3000", description: "Servidor local de desarrollo" }],
  tags: [
    { name: "Auth", description: "Registro, login y logout de usuarios" },
    { name: "Users", description: "CRUD interno de usuarios (sin guards)" },
    { name: "Customers", description: "Gestión de perfiles de cliente" },
    { name: "Categories", description: "Categorías del catálogo de productos" },
    { name: "Brands", description: "Marcas del catálogo de productos" },
    { name: "Products", description: "Productos del catálogo (stock y encargo)" },
    { name: "Cart", description: "Carrito de compras del cliente" },
    { name: "Orders", description: "Pedidos de compra" },
  ],

  // ── Componentes reutilizables ──────────────────────────────────────────────
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        description:
          "Token opaco de sesión (no JWT) obtenido del endpoint POST /api/auth/login. " +
          "Validez: 24 horas. Enviar en el header Authorization como: Bearer <token>",
      },
    },
    schemas: {
      // ── Entidades ────────────────────────────────────────────────────────
      // La API nunca devuelve el password, por eso no figura en el schema.
      User: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          email: { type: "string" as const, format: "email" },
          role: { type: "string" as const, enum: ["cliente", "owner"] },
          created_at: { type: "string" as const, format: "date-time" },
        },
        required: ["id", "email", "role", "created_at"],
      },
      Customer: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          user_id: { type: "string" as const },
          name: { type: "string" as const },
          government_id: {
            type: "string" as const,
            nullable: true,
            description: "CUIT/CUIL de 11 dígitos",
          },
          tax_status: {
            type: "string" as const,
            enum: ["consumidor_final", "responsable_inscripto", "monotributo", "exento"],
          },
          phone: { type: "string" as const, nullable: true },
          address: { type: "string" as const, nullable: true },
          created_at: { type: "string" as const, format: "date-time" },
        },
        required: ["id", "user_id", "name", "tax_status", "created_at"],
      },
      Category: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          description: { type: "string" as const, nullable: true },
        },
        required: ["id", "name"],
      },
      Brand: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          logo_url: { type: "string" as const, nullable: true },
        },
        required: ["id", "name"],
      },
      Product: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          name: { type: "string" as const },
          description: { type: "string" as const, nullable: true },
          type: { type: "string" as const, enum: ["stock", "encargo"] },
          price: {
            type: "number" as const,
            nullable: true,
            description: "null para productos tipo encargo",
          },
          stock: { type: "integer" as const },
          category_id: { type: "string" as const },
          brand_id: { type: "string" as const },
          is_active: { type: "boolean" as const },
        },
        required: ["id", "name", "type", "stock", "category_id", "brand_id", "is_active"],
      },
      ProductWithNames: {
        allOf: [
          { $ref: "#/components/schemas/Product" },
          {
            type: "object" as const,
            properties: {
              category_name: { type: "string" as const },
              brand_name: { type: "string" as const },
            },
            required: ["category_name", "brand_name"],
          },
        ],
      },
      CartItem: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          product_id: { type: "string" as const },
          quantity: { type: "integer" as const },
        },
        required: ["id", "product_id", "quantity"],
      },
      Cart: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          customer_id: { type: "string" as const },
          items: { type: "array" as const, items: { $ref: "#/components/schemas/CartItem" } },
          updated_at: { type: "string" as const, format: "date-time" },
        },
        required: ["id", "customer_id", "items", "updated_at"],
      },
      OrderItem: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          product_id: { type: "string" as const },
          product_name: { type: "string" as const },
          unit_price: {
            type: "number" as const,
            nullable: true,
            description: "null para productos tipo encargo",
          },
          quantity: { type: "integer" as const },
          type: { type: "string" as const },
        },
        required: ["id", "product_id", "product_name", "quantity", "type"],
      },
      Order: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const },
          customer_id: { type: "string" as const },
          status: {
            type: "string" as const,
            enum: [
              "pendiente",
              "confirmado",
              "en_preparacion",
              "listo_para_retirar",
              "entregado",
              "cancelado",
            ],
          },
          delivery_type: { type: "string" as const, enum: ["retiro", "envio"] },
          delivery_address: { type: "string" as const, nullable: true },
          total: { type: "number" as const },
          created_at: { type: "string" as const, format: "date-time" },
          items: { type: "array" as const, items: { $ref: "#/components/schemas/OrderItem" } },
        },
        required: ["id", "customer_id", "status", "delivery_type", "total", "created_at", "items"],
      },
      Error: {
        type: "object" as const,
        properties: {
          error: { type: "string" as const },
        },
        required: ["error"],
      },
    },
  },

  // ── Paths ──────────────────────────────────────────────────────────────────
  paths: {
    // ═══════════════════ Auth ═══════════════════════════════════════════════
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registrar un nuevo usuario con rol cliente",
        description:
          "Crea un User con rol 'cliente' y un Customer asociado. " + "No requiere autenticación.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  email: { type: "string" as const, format: "email" },
                  password: { type: "string" as const, minLength: 6 },
                },
                required: ["name", "email", "password"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Registro exitoso",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    user: {
                      type: "object" as const,
                      properties: {
                        id: { type: "string" as const },
                        email: { type: "string" as const },
                        role: { type: "string" as const },
                      },
                    },
                    customer: {
                      type: "object" as const,
                      properties: {
                        id: { type: "string" as const },
                        name: { type: "string" as const },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Email ya registrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión y obtener un token de sesión",
        description:
          "Valida credenciales y devuelve un token opaco con validez de 24 horas. " +
          "No requiere autenticación.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  email: { type: "string" as const, format: "email" },
                  password: { type: "string" as const },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login exitoso",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    id: { type: "string" as const },
                    email: { type: "string" as const },
                    role: { type: "string" as const },
                    customer_id: { type: "string" as const, nullable: true },
                    token: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": {
            description: "Credenciales inválidas",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Cerrar sesión eliminando el token",
        description:
          "Elimina la sesión asociada al token enviado en el header Authorization. " +
          "No requiere el middleware de autenticación (el controller extrae el token manualmente).",
        parameters: [
          {
            name: "Authorization",
            in: "header" as const,
            required: false,
            schema: { type: "string" as const },
            description: "Bearer <token>",
          },
        ],
        responses: {
          "204": { description: "Sesión cerrada (sin body)" },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Users ══════════════════════════════════════════════
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "Listar todos los usuarios — Solo owner",
        description:
          "Requiere autenticación y rol owner. Nunca devuelve el password de los usuarios.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Lista de usuarios",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/User" } },
              },
            },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/user/{id}": {
      get: {
        tags: ["Users"],
        summary: "Obtener un usuario por ID — Solo owner",
        description: "Requiere autenticación y rol owner. Nunca devuelve el password.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Usuario encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Usuario no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      put: {
        tags: ["Users"],
        summary: "Actualizar un usuario por ID — Solo owner",
        description: "Requiere autenticación y rol owner. Nunca devuelve el password.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  email: { type: "string" as const, format: "email" },
                  password: { type: "string" as const },
                  role: { type: "string" as const, enum: ["cliente", "owner"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Usuario actualizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Usuario no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Email duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Eliminar un usuario por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "204": { description: "Usuario eliminado (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Usuario no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/user": {
      post: {
        tags: ["Users"],
        summary: "Crear un usuario — Solo owner",
        description:
          "Requiere autenticación y rol owner. El alta pública de clientes va por /api/auth/register. Nunca devuelve el password.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  email: { type: "string" as const, format: "email" },
                  password: { type: "string" as const },
                  role: { type: "string" as const, enum: ["cliente", "owner"] },
                },
                required: ["email", "password", "role"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Usuario creado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Email duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Customers ══════════════════════════════════════════
    "/api/customers": {
      get: {
        tags: ["Customers"],
        summary: "Listar todos los clientes — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Lista de clientes",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: { $ref: "#/components/schemas/Customer" },
                },
              },
            },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/customer/{id}": {
      get: {
        tags: ["Customers"],
        summary: "Obtener un cliente por ID — Owner o el propio cliente",
        description:
          "Requiere autenticación. El owner puede ver cualquier cliente; el resto solo el propio.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Cliente encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No tiene permiso para ver este cliente",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Cliente no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      put: {
        tags: ["Customers"],
        summary: "Actualizar un cliente por ID — Cualquier usuario autenticado",
        description:
          "Requiere autenticación (cualquier rol). El service valida que el cliente pertenezca al usuario.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  government_id: {
                    type: "string" as const,
                    nullable: true,
                    description: "CUIT/CUIL 11 dígitos, o null",
                  },
                  tax_status: {
                    type: "string" as const,
                    enum: ["consumidor_final", "responsable_inscripto", "monotributo", "exento"],
                  },
                  phone: { type: "string" as const, nullable: true },
                  address: { type: "string" as const, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Cliente actualizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Cliente no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Customers"],
        summary: "Eliminar un cliente por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "204": { description: "Cliente eliminado (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Cliente no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/customer": {
      post: {
        tags: ["Customers"],
        summary: "Crear un cliente",
        description:
          "Crea un perfil de cliente. Ruta sin guards (se usa internamente en el registro).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  user_id: { type: "string" as const },
                  name: { type: "string" as const },
                  government_id: { type: "string" as const, nullable: true },
                  tax_status: {
                    type: "string" as const,
                    enum: ["consumidor_final", "responsable_inscripto", "monotributo", "exento"],
                  },
                  phone: { type: "string" as const, nullable: true },
                  address: { type: "string" as const, nullable: true },
                },
                required: ["user_id", "name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Cliente creado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Customer" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Categories ═════════════════════════════════════════
    "/api/categories": {
      get: {
        tags: ["Categories"],
        summary: "Listar todas las categorías — Público",
        description: "No requiere autenticación.",
        responses: {
          "200": {
            description: "Lista de categorías",
            content: {
              "application/json": {
                schema: {
                  type: "array" as const,
                  items: { $ref: "#/components/schemas/Category" },
                },
              },
            },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/category/{id}": {
      get: {
        tags: ["Categories"],
        summary: "Obtener una categoría por ID — Público",
        description: "No requiere autenticación.",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Categoría encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
          },
          "404": {
            description: "Categoría no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      put: {
        tags: ["Categories"],
        summary: "Actualizar una categoría por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  description: { type: "string" as const, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Categoría actualizada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Categoría no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Nombre duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Categories"],
        summary: "Eliminar una categoría por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "204": { description: "Categoría eliminada (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Categoría no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/category": {
      post: {
        tags: ["Categories"],
        summary: "Crear una categoría — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  description: { type: "string" as const, nullable: true },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Categoría creada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Category" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Nombre duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Brands ═════════════════════════════════════════════
    "/api/brands": {
      get: {
        tags: ["Brands"],
        summary: "Listar todas las marcas — Público",
        description: "No requiere autenticación.",
        responses: {
          "200": {
            description: "Lista de marcas",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/Brand" } },
              },
            },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/brand/{id}": {
      get: {
        tags: ["Brands"],
        summary: "Obtener una marca por ID — Público",
        description: "No requiere autenticación.",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Marca encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Brand" } } },
          },
          "404": {
            description: "Marca no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      put: {
        tags: ["Brands"],
        summary: "Actualizar una marca por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  logo_url: { type: "string" as const, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Marca actualizada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Brand" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Marca no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Nombre duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Brands"],
        summary: "Eliminar una marca por ID — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "204": { description: "Marca eliminada (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Marca no encontrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/brand": {
      post: {
        tags: ["Brands"],
        summary: "Crear una marca — Solo owner",
        description: "Requiere autenticación y rol owner.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  logo_url: { type: "string" as const, nullable: true },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Marca creada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Brand" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "409": {
            description: "Nombre duplicado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Products ═══════════════════════════════════════════
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "Listar productos (con filtros opcionales) — Público",
        description: "No requiere autenticación. Permite filtrar por categoría y/o marca.",
        parameters: [
          {
            name: "category_id",
            in: "query" as const,
            required: false,
            schema: { type: "string" as const },
            description: "Filtrar por ID de categoría",
          },
          {
            name: "brand_id",
            in: "query" as const,
            required: false,
            schema: { type: "string" as const },
            description: "Filtrar por ID de marca",
          },
        ],
        responses: {
          "200": {
            description: "Lista de productos",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/Product" } },
              },
            },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/product/{id}": {
      get: {
        tags: ["Products"],
        summary: "Obtener un producto por ID (con nombres de categoría y marca) — Público",
        description:
          "No requiere autenticación. Devuelve el producto enriquecido con category_name y brand_name.",
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Producto encontrado",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ProductWithNames" } },
            },
          },
          "404": {
            description: "Producto no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      put: {
        tags: ["Products"],
        summary: "Actualizar un producto por ID — Solo owner",
        description:
          "Requiere autenticación y rol owner. Si se cambia el tipo a 'encargo', price se fuerza a null y stock a 0.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  description: { type: "string" as const, nullable: true },
                  type: { type: "string" as const, enum: ["stock", "encargo"] },
                  price: { type: "number" as const, nullable: true },
                  stock: { type: "integer" as const },
                  category_id: { type: "string" as const },
                  brand_id: { type: "string" as const },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Producto actualizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Producto no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Products"],
        summary: "Eliminar (soft-delete) un producto por ID — Solo owner",
        description:
          "Requiere autenticación y rol owner. Marca el producto como inactivo (is_active = false).",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "204": { description: "Producto eliminado (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Producto no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/product": {
      post: {
        tags: ["Products"],
        summary: "Crear un producto — Solo owner",
        description:
          "Requiere autenticación y rol owner. " +
          "Si type='encargo', price se ignora (se guarda null) y stock se fuerza a 0. " +
          "Si type='stock', price debe ser > 0 y stock >= 0.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  description: { type: "string" as const, nullable: true },
                  type: { type: "string" as const, enum: ["stock", "encargo"] },
                  price: {
                    type: "number" as const,
                    nullable: true,
                    description: "Obligatorio si type='stock', ignorado si type='encargo'",
                  },
                  stock: {
                    type: "integer" as const,
                    description: "Obligatorio si type='stock', ignorado si type='encargo'",
                  },
                  category_id: { type: "string" as const },
                  brand_id: { type: "string" as const },
                },
                required: ["name", "type", "category_id", "brand_id"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Producto creado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Product" } } },
          },
          "400": {
            description: "Datos inválidos",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Cart ═══════════════════════════════════════════════
    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Obtener el carrito del cliente autenticado — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. " +
          "Si el cliente no tiene carrito, se crea uno vacío automáticamente.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Carrito del cliente",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
          "400": {
            description: "Error de validación",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Vaciar el carrito del cliente autenticado — Solo cliente",
        description: "Requiere autenticación y rol cliente. Elimina todos los items del carrito.",
        security: [{ bearerAuth: [] }],
        responses: {
          "204": { description: "Carrito vaciado (sin body)" },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "Agregar un item al carrito — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. " +
          "Si el producto ya está en el carrito, suma la cantidad. " +
          "Valida stock disponible para productos tipo 'stock'.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  product_id: { type: "string" as const },
                  quantity: { type: "integer" as const, minimum: 1 },
                },
                required: ["product_id", "quantity"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Carrito actualizado con el nuevo item",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
          "400": {
            description: "Datos inválidos o stock insuficiente",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/cart/items/{productId}": {
      delete: {
        tags: ["Cart"],
        summary: "Eliminar un item del carrito — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. Elimina el item del producto indicado del carrito.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "productId",
            in: "path" as const,
            required: true,
            schema: { type: "string" as const },
            description: "ID del producto a eliminar del carrito",
          },
        ],
        responses: {
          "200": {
            description: "Carrito actualizado sin el item eliminado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Cart" } } },
          },
          "400": {
            description: "Error de validación",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    // ═══════════════════ Orders ═════════════════════════════════════════════
    "/api/order": {
      post: {
        tags: ["Orders"],
        summary: "Crear un pedido — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. " +
          "Los items pueden venir en el body o tomarse automáticamente del carrito del cliente. " +
          "delivery_type debe ser 'retiro' o 'envio' (si es envio, delivery_address es obligatorio). " +
          "Se descuenta el stock de los productos tipo 'stock' y si los items vinieron del carrito, se vacía.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  delivery_type: { type: "string" as const, enum: ["retiro", "envio"] },
                  delivery_address: {
                    type: "string" as const,
                    nullable: true,
                    description: "Obligatorio si delivery_type='envio'",
                  },
                  items: {
                    type: "array" as const,
                    description: "Opcional. Si no se envía, se toman los items del carrito.",
                    items: {
                      type: "object" as const,
                      properties: {
                        product_id: { type: "string" as const },
                        quantity: { type: "integer" as const, minimum: 1 },
                      },
                      required: ["product_id", "quantity"],
                    },
                  },
                },
                required: ["delivery_type"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Pedido creado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
          "400": {
            description: "Datos inválidos o stock insuficiente",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/orders/mine": {
      get: {
        tags: ["Orders"],
        summary: "Listar los pedidos del cliente autenticado — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. Devuelve solo los pedidos del customer asociado al usuario.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Lista de pedidos del cliente",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/Order" } },
              },
            },
          },
          "400": {
            description: "Error de validación",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "Listar todos los pedidos (con filtro opcional de estado) — Solo owner",
        description:
          "Requiere autenticación y rol owner. Permite filtrar por estado con el query param 'status'.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query" as const,
            required: false,
            schema: {
              type: "string" as const,
              enum: [
                "pendiente",
                "confirmado",
                "en_preparacion",
                "listo_para_retirar",
                "entregado",
                "cancelado",
              ],
            },
            description: "Filtrar por estado del pedido",
          },
        ],
        responses: {
          "200": {
            description: "Lista de pedidos",
            content: {
              "application/json": {
                schema: { type: "array" as const, items: { $ref: "#/components/schemas/Order" } },
              },
            },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/order/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Obtener un pedido por ID — Cualquier usuario autenticado",
        description: "Requiere autenticación (cualquier rol).",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Pedido encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Pedido no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/order/{id}/status": {
      put: {
        tags: ["Orders"],
        summary: "Cambiar el estado de un pedido (un paso adelante en el flujo) — Solo owner",
        description:
          "Requiere autenticación y rol owner. " +
          "Solo permite avanzar exactamente un paso en el flujo: " +
          "pendiente → confirmado → en_preparacion → listo_para_retirar → entregado. " +
          "No se puede cambiar el estado de una orden cancelada.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  status: {
                    type: "string" as const,
                    enum: ["confirmado", "en_preparacion", "listo_para_retirar", "entregado"],
                  },
                },
                required: ["status"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Estado actualizado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
          "400": {
            description: "Transición de estado no permitida",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol owner)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Pedido no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },

    "/api/order/{id}/cancel": {
      put: {
        tags: ["Orders"],
        summary: "Cancelar un pedido propio si está pendiente — Solo cliente",
        description:
          "Requiere autenticación y rol cliente. " +
          "Solo se puede cancelar un pedido propio que esté en estado 'pendiente'. " +
          "Intentar cancelar el pedido de otro cliente devuelve 403.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } },
        ],
        responses: {
          "200": {
            description: "Pedido cancelado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
          },
          "400": {
            description: "No se puede cancelar (el pedido no está pendiente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "401": {
            description: "No autenticado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "403": {
            description: "No autorizado (requiere rol cliente, o el pedido es de otro cliente)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "404": {
            description: "Pedido no encontrado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": {
            description: "Error interno del servidor",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
  },
} as const;

export default openApiSpec;
