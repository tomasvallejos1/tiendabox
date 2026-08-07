CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(36)  PRIMARY KEY,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'cliente',
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

INSERT INTO users (id, email, password, role)
VALUES (
  REPLACE(gen_random_uuid()::text, '-', ''),
  'admin@tiendabox.com',
  'admin123',
  'owner'
)
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) UNIQUE NOT NULL REFERENCES users(id),
  name          VARCHAR(150) NOT NULL,
  government_id VARCHAR(20),
  tax_status    VARCHAR(30) NOT NULL DEFAULT 'consumidor_final',
  phone         VARCHAR(30),
  address       VARCHAR(255),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(36) PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS carts (
  id          VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) UNIQUE NOT NULL REFERENCES customers(id),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         VARCHAR(36) PRIMARY KEY,
  cart_id    VARCHAR(36) NOT NULL REFERENCES carts(id),
  product_id VARCHAR(36) NOT NULL,
  quantity   INT NOT NULL CHECK (quantity > 0),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id               VARCHAR(36) PRIMARY KEY,
  customer_id      VARCHAR(36) NOT NULL REFERENCES customers(id),
  status           VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  delivery_type    VARCHAR(20) NOT NULL,
  delivery_address VARCHAR(255),
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           VARCHAR(36) PRIMARY KEY,
  order_id     VARCHAR(36) NOT NULL REFERENCES orders(id),
  product_id   VARCHAR(36) NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  unit_price   NUMERIC(12,2),
  quantity     INT NOT NULL CHECK (quantity > 0),
  type         VARCHAR(20) NOT NULL
);

-- Migraciones idempotentes: los CREATE TABLE de arriba usan IF NOT EXISTS, asi que
-- no afectan a bases ya creadas. Lo que sigue aplica los mismos constraints sobre
-- bases existentes y se puede correr en cada arranque sin efecto.

-- Un unico carrito activo por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS carts_customer_id_uidx
  ON carts (customer_id);

-- Un producto no puede aparecer dos veces en el mismo carrito.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_uidx
  ON cart_items (cart_id, product_id);

-- La expiracion de sesion se serializa con ::text y se parsea con new Date(): sin
-- zona horaria el string se interpretaba como hora local del proceso, corriendo la
-- expiracion cuando el TZ del proceso no coincidia con el de la base.
ALTER TABLE sessions ALTER COLUMN expires_at TYPE TIMESTAMPTZ;
