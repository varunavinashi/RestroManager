-- ML tables for the recommender feature (Phase 10B).
-- Loaded by `npm run db:init` after indexes.sql and before seed.sql, so the
-- tables are always rebuilt from scratch.

DROP TABLE IF EXISTS item_recommendations;
DROP TABLE IF EXISTS ml_model_runs;

CREATE TABLE item_recommendations (
  item_id INT NOT NULL,
  recommended_item_id INT NOT NULL,
  score DECIMAL(8, 5) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  trained_at DATETIME NOT NULL,
  PRIMARY KEY (item_id, recommended_item_id),
  CONSTRAINT fk_item_recommendations_item
    FOREIGN KEY (item_id) REFERENCES menu_items(item_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_item_recommendations_recommended
    FOREIGN KEY (recommended_item_id) REFERENCES menu_items(item_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ml_model_runs (
  run_id INT AUTO_INCREMENT PRIMARY KEY,
  trained_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  model_name VARCHAR(100) NOT NULL,
  hit_at_3 DECIMAL(8, 5) NOT NULL,
  mrr_at_3 DECIMAL(8, 5) NOT NULL,
  n_train_orders INT NOT NULL,
  n_val_orders INT NOT NULL,
  n_test_orders INT NOT NULL,
  notes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
