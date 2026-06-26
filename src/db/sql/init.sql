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
