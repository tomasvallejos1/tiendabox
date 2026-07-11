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
