-- The test fixture for MySQL 8 / MariaDB 10.5+: load into a scratch database, then run
--   TEST_MYSQL_URL=mysql://user@host:3306/<db> node test/run.mjs
CREATE TABLE accounts (id BIGINT PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'suspended')),
  mood ENUM('calm', 'busy'), deleted_at DATETIME);
CREATE TABLE coupons (code VARCHAR(40) PRIMARY KEY, kind VARCHAR(10) NOT NULL CHECK (kind = 'percent' OR kind = 'fixed'));
CREATE TABLE `order` (id BIGINT PRIMARY KEY, account_id BIGINT NOT NULL, coupon_code VARCHAR(40), total_cents INT NOT NULL CHECK (total_cents >= 0),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (coupon_code) REFERENCES coupons(code) ON DELETE SET NULL);
CREATE TABLE products (id BIGINT PRIMARY KEY, sku VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(200) NOT NULL);
CREATE TABLE order_lines (order_id BIGINT NOT NULL, line_no INT NOT NULL, product_id BIGINT NOT NULL, qty INT NOT NULL, PRIMARY KEY (order_id, line_no),
  FOREIGN KEY (order_id) REFERENCES `order`(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES products(id));
CREATE TABLE refunds (id BIGINT PRIMARY KEY, order_id BIGINT NOT NULL, line_no INT NOT NULL,
  FOREIGN KEY (order_id, line_no) REFERENCES order_lines(order_id, line_no) ON DELETE CASCADE);
CREATE TABLE categories (id BIGINT PRIMARY KEY, parent_id BIGINT, name VARCHAR(100) NOT NULL, FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE);
CREATE TABLE teams (id BIGINT PRIMARY KEY, captain_id BIGINT);
CREATE TABLE players (id BIGINT PRIMARY KEY, team_id BIGINT, FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE);
ALTER TABLE teams ADD FOREIGN KEY (captain_id) REFERENCES players(id) ON DELETE SET NULL;
CREATE TABLE loop_a (id BIGINT PRIMARY KEY, b_id BIGINT);
CREATE TABLE loop_b (id BIGINT PRIMARY KEY, a_id BIGINT, FOREIGN KEY (a_id) REFERENCES loop_a(id) ON DELETE CASCADE);
ALTER TABLE loop_a ADD FOREIGN KEY (b_id) REFERENCES loop_b(id) ON DELETE CASCADE;
CREATE INDEX order_account_idx ON `order`(account_id, id DESC);
CREATE UNIQUE INDEX accounts_email_lower ON accounts((lower(email)));
CREATE TABLE schema_migrations (version VARCHAR(40) PRIMARY KEY);
