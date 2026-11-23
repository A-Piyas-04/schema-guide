-- The test fixture for PostgreSQL: load into a scratch database, then run
--   TEST_PG_URL=postgres://user@host:5432/<db> node test/run.mjs
CREATE TYPE mood AS ENUM ('calm', 'busy');
CREATE TABLE accounts (id bigint PRIMARY KEY, email text NOT NULL UNIQUE, status text NOT NULL CHECK (status IN ('active', 'suspended')), mood mood, deleted_at timestamptz);
CREATE TABLE coupons (code text PRIMARY KEY, kind text NOT NULL CHECK (kind = 'percent' OR kind = 'fixed'));
CREATE TABLE "order" (id bigint PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  coupon_code text REFERENCES coupons(code) ON DELETE SET NULL, total_cents integer NOT NULL CHECK (total_cents >= 0));
CREATE TABLE products (id bigint PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE order_lines (order_id bigint NOT NULL REFERENCES "order"(id) ON DELETE CASCADE, line_no integer NOT NULL,
  product_id bigint NOT NULL REFERENCES products(id), qty integer NOT NULL, PRIMARY KEY (order_id, line_no));
CREATE TABLE refunds (id bigint PRIMARY KEY, order_id bigint NOT NULL, line_no integer NOT NULL,
  FOREIGN KEY (order_id, line_no) REFERENCES order_lines(order_id, line_no) ON DELETE CASCADE);
CREATE TABLE categories (id bigint PRIMARY KEY, parent_id bigint REFERENCES categories(id) ON DELETE CASCADE, name text NOT NULL);
CREATE TABLE teams (id bigint PRIMARY KEY, captain_id bigint);
CREATE TABLE players (id bigint PRIMARY KEY, team_id bigint REFERENCES teams(id) ON DELETE CASCADE);
ALTER TABLE teams ADD FOREIGN KEY (captain_id) REFERENCES players(id) ON DELETE SET NULL;
CREATE TABLE loop_a (id bigint PRIMARY KEY, b_id bigint);
CREATE TABLE loop_b (id bigint PRIMARY KEY, a_id bigint REFERENCES loop_a(id) ON DELETE CASCADE);
ALTER TABLE loop_a ADD FOREIGN KEY (b_id) REFERENCES loop_b(id) ON DELETE CASCADE;
CREATE INDEX order_account_idx ON "order"(account_id, id DESC);
CREATE UNIQUE INDEX accounts_email_lower ON accounts(lower(email));
CREATE INDEX live_accounts ON accounts(id) WHERE deleted_at IS NULL;
CREATE TABLE schema_migrations (version text PRIMARY KEY);
