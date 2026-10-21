ALTER TABLE sandbox_payouts DROP CONSTRAINT sandbox_payouts_status_check;
ALTER TABLE sandbox_payouts ADD CHECK(status IN ('pending','paid','reconciled','cancelled'));
ALTER TABLE care_subscriptions ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled'));
CREATE TABLE cart_items(user_id uuid REFERENCES users(id),product_id uuid REFERENCES products(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,product_id));
CREATE TABLE product_wishlist(user_id uuid REFERENCES users(id),product_id uuid REFERENCES products(id),PRIMARY KEY(user_id,product_id));
CREATE TABLE product_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),product_id uuid NOT NULL REFERENCES products(id),order_line_id uuid NOT NULL UNIQUE REFERENCES order_lines(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
