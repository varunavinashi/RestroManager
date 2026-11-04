"""Train, evaluate, and persist item recommendations for RestroManager

The script reads order history from MySQL, evaluates three recommenders with a
strict date-based split, retrains the best one on train + validation, and
writes its top-10 recommendations to item_recommendations
"""

import json
from datetime import datetime

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import mysql.connector
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from config import (
    ARTIFACTS_DIR,
    BOOTSTRAP_SAMPLES,
    COOCCURRENCE_MIN_SUPPORTS,
    DB_CONFIG,
    MIN_ORDERS,
    N_RECOMMENDATIONS,
    RANDOM_STATE,
    TOP_K,
)

ORDER_QUERY = """
SELECT o.order_id, o.order_time, oi.item_id
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
ORDER BY o.order_time, o.order_id, oi.item_id
"""


def connect_to_database():
    """Open a MySQL connection using the settings from server/.env"""
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except mysql.connector.Error as err:
        raise SystemExit(
            f"Could not connect to MySQL at {DB_CONFIG['host']}:{DB_CONFIG['port']} "
            f"database '{DB_CONFIG['database']}': {err}. "
            "Check server/.env and make sure MySQL is running."
        ) from err


def load_orders():
    """Load orders joined to order items with pandas"""
    connection = connect_to_database()
    try:
        raw = pd.read_sql(ORDER_QUERY, connection)
    finally:
        connection.close()

    if raw.empty:
        return raw

    raw["order_id"] = raw["order_id"].astype(int)
    raw["item_id"] = raw["item_id"].astype(int)
    raw["order_time"] = pd.to_datetime(raw["order_time"])
    return raw


def build_binary_matrix(raw):
    """Deduplicate items per order, drop small baskets, and build X"""
    items = raw[["order_id", "item_id", "order_time"]].copy()
    items["order_date"] = items["order_time"].dt.date
    items = items.drop_duplicates(["order_id", "item_id"])

    basket_sizes = items.groupby("order_id")["item_id"].nunique()
    kept_order_ids = basket_sizes[basket_sizes >= 2].index
    items = items[items["order_id"].isin(kept_order_ids)]

    matrix = pd.crosstab(items["order_id"], items["item_id"])
    matrix = (matrix > 0).astype(np.int8)

    order_ids = matrix.index.to_numpy()
    item_ids = matrix.columns.to_numpy(dtype=int)
    order_dates = (
        items.groupby("order_id")["order_date"].first().reindex(order_ids)
    )

    print(
        f"Baskets: {len(order_ids)} orders with at least 2 distinct items "
        f"({len(item_ids)} items)"
    )
    return matrix.to_numpy(dtype=np.int8), order_ids, item_ids, order_dates


def split_by_date(X, order_dates):
    """Split the first 70% / next 15% / last 15% of calendar days."""
    unique_dates = np.array(sorted(pd.unique(order_dates)))
    day_count = len(unique_dates)

    if day_count < 3:
        raise SystemExit(
            f"Only {day_count} distinct order date(s) found; need at least 3 "
            "to build a non-overlapping train/validation/test split."
        )

    train_end = max(1, int(day_count * 0.70))
    val_end = max(train_end + 1, int(day_count * 0.85))
    val_end = min(val_end, day_count - 1)

    if train_end >= val_end:
        train_end = day_count - 2
        val_end = day_count - 1

    train_dates = unique_dates[:train_end]
    val_dates = unique_dates[train_end:val_end]
    test_dates = unique_dates[val_end:]

    train_mask = order_dates.isin(train_dates).to_numpy()
    val_mask = order_dates.isin(val_dates).to_numpy()
    test_mask = order_dates.isin(test_dates).to_numpy()

    X_train = X[train_mask]
    X_val = X[val_mask]
    X_test = X[test_mask]

    max_train = max(train_dates)
    min_val = min(val_dates)
    min_test = min(test_dates)

    print("Time split by calendar date (no overlap):")
    print(
        f"  train: {X_train.shape[0]:5d} orders, {len(train_dates):2d} days "
        f"({min(train_dates)} to {max_train})"
    )
    print(
        f"  val:   {X_val.shape[0]:5d} orders, {len(val_dates):2d} days "
        f"({min_val} to {max(val_dates)})"
    )
    print(
        f"  test:  {X_test.shape[0]:5d} orders, {len(test_dates):2d} days "
        f"({min_test} to {max(test_dates)})"
    )
    print(
        f"  assertion: max(train) {max_train} < min(val) {min_val} "
        f"< min(test) {min_test}"
    )
    assert max_train < min_val < min_test

    split_info = {
        "train": {
            "orders": int(X_train.shape[0]),
            "days": int(len(train_dates)),
            "start": str(min(train_dates)),
            "end": str(max_train),
        },
        "validation": {
            "orders": int(X_val.shape[0]),
            "days": int(len(val_dates)),
            "start": str(min_val),
            "end": str(max(val_dates)),
        },
        "test": {
            "orders": int(X_test.shape[0]),
            "days": int(len(test_dates)),
            "start": str(min_test),
            "end": str(max(test_dates)),
        },
    }
    return X_train, X_val, X_test, split_info


class ScoreMatrixRecommender:
    """Rank items by summing one row of an item-by-item score matrix"""

    def __init__(self, name, score_matrix):
        self.name = name
        self.score_matrix = np.asarray(score_matrix, dtype=float)

    def recommend(self, cart, k=TOP_K):
        if len(cart) == 0:
            return np.array([], dtype=int)

        scores = self.score_matrix[cart].sum(axis=0)
        scores[cart] = -np.inf
        order = np.argsort(-scores, kind="stable")
        order = order[np.isfinite(scores[order])]
        return order[:k]


def popularity_vector(X):
    """Return each item's share of training baskets"""
    order_count = max(int(X.shape[0]), 1)
    return X.sum(axis=0).astype(float) / order_count


def build_popularity_model(X):
    popularity = popularity_vector(X)
    score_matrix = np.tile(popularity, (X.shape[1], 1))
    return ScoreMatrixRecommender("popularity", score_matrix)


def build_cooccurrence_model(X, min_support):
    """Build confidence count(a, b) / count(a), then mask weak pairs"""
    counts = (X.T @ X).astype(float)
    item_support = np.diag(counts).copy()
    confidence = np.zeros_like(counts, dtype=float)

    np.divide(
        counts,
        item_support[:, None],
        out=confidence,
        where=item_support[:, None] > 0,
    )
    confidence[counts < float(min_support)] = 0.0
    np.fill_diagonal(confidence, 0.0)

    return ScoreMatrixRecommender(
        f"cooccurrence_min_support_{min_support}", confidence
    )


def build_cosine_model(X):
    similarity = cosine_similarity(X.T)
    np.fill_diagonal(similarity, 0.0)
    return ScoreMatrixRecommender("cosine", similarity)


def bootstrap_hit_interval(hits):
    """Seeded 95% percentile bootstrap interval for Hit@3"""
    if not hits:
        return [0.0, 0.0]

    values = np.asarray(hits, dtype=float)
    rng = np.random.default_rng(RANDOM_STATE)
    means = np.empty(BOOTSTRAP_SAMPLES, dtype=float)

    for index in range(BOOTSTRAP_SAMPLES):
        sample = rng.choice(values, size=values.size, replace=True)
        means[index] = sample.mean()

    low, high = np.percentile(means, [2.5, 97.5])
    return [round(float(low), 5), round(float(high), 5)]


def evaluate(model, X, split_name):
    """Hide one seeded item per basket and score top-3 recommendations"""
    rng = np.random.default_rng(RANDOM_STATE)
    hits = []
    reciprocal_ranks = []

    for row in X:
        basket = np.flatnonzero(row)
        if basket.size < 2:
            continue

        hidden_position = int(rng.integers(basket.size))
        hidden_item = int(basket[hidden_position])
        cart = np.delete(basket, hidden_position)

        recommendations = model.recommend(cart, TOP_K)
        if np.any(recommendations == hidden_item):
            rank = int(np.flatnonzero(recommendations == hidden_item)[0]) + 1
            hits.append(1.0)
            reciprocal_ranks.append(1.0 / rank)
        else:
            hits.append(0.0)
            reciprocal_ranks.append(0.0)

    hit_at_3 = float(np.mean(hits)) if hits else 0.0
    mrr_at_3 = float(np.mean(reciprocal_ranks)) if reciprocal_ranks else 0.0
    interval = bootstrap_hit_interval(hits)

    metrics = {
        "hit_at_3": round(hit_at_3, 5),
        "mrr_at_3": round(mrr_at_3, 5),
        "hit_at_3_ci95": interval,
        "n_eval_orders": len(hits),
    }

    print(
        f"  {split_name:17s} {model.name:35s} "
        f"Hit@3={hit_at_3:.3f} MRR@3={mrr_at_3:.3f} "
        f"95% CI=[{interval[0]:.3f}, {interval[1]:.3f}]"
    )
    return metrics


def tune_cooccurrence(X_train, X_val):
    """Pick min_support by validation Hit@3 only."""
    results = []

    for min_support in COOCCURRENCE_MIN_SUPPORTS:
        model = build_cooccurrence_model(X_train, min_support)
        metrics = evaluate(model, X_val, f"val support={min_support}")
        results.append({"min_support": min_support, **metrics})

    best = sorted(
        results,
        key=lambda result: (
            -result["hit_at_3"],
            -result["mrr_at_3"],
            result["min_support"],
        ),
    )[0]
    return best["min_support"], results


def build_recommendation_rows(score_matrix, item_ids, fallback_popularity, model_name, trained_at):
    """Return the top N recommendations for every menu item"""
    rows = []
    item_count = len(item_ids)

    for item_index in range(item_count):
        scores = np.array(score_matrix[item_index], dtype=float, copy=True)
        scores[item_index] = -np.inf

        if not np.any(scores[np.isfinite(scores)] > 0):
            scores = np.array(fallback_popularity, dtype=float, copy=True)
            scores[item_index] = -np.inf

        order = np.argsort(-scores, kind="stable")[:N_RECOMMENDATIONS]
        for candidate_index in order:
            score = scores[candidate_index]
            if not np.isfinite(score):
                continue
            rows.append(
                (
                    int(item_ids[item_index]),
                    int(item_ids[candidate_index]),
                    round(float(score), 5),
                    model_name,
                    trained_at,
                )
            )

    return rows


def plot_hit_at_3(model_results, output_path):
    model_names = list(model_results)
    labels = [name.replace("_", " ").title() for name in model_names]
    validation_hits = [
        model_results[name]["validation"]["hit_at_3"] for name in model_names
    ]
    test_hits = [model_results[name]["test"]["hit_at_3"] for name in model_names]

    positions = np.arange(len(model_names))
    width = 0.35
    figure, axis = plt.subplots(figsize=(8, 5))

    axis.bar(
        positions - width / 2,
        validation_hits,
        width,
        label="Validation",
        color="#2563eb",
    )
    axis.bar(
        positions + width / 2,
        test_hits,
        width,
        label="Test",
        color="#16a34a",
    )

    axis.set_xticks(positions)
    axis.set_xticklabels(labels)
    axis.set_ylabel("Hit@3")
    axis.set_title("Recommender Hit@3 by model")
    axis.set_ylim(0, max(max(validation_hits + test_hits), 0.05) * 1.25)
    axis.legend()
    figure.tight_layout()
    figure.savefig(output_path, dpi=150)
    plt.close(figure)


def write_database_outputs(recommendation_rows, run_row):
    """Replace recommendations and append one model-run row in a transaction"""
    connection = connect_to_database()
    cursor = connection.cursor()

    try:
        cursor.execute("DELETE FROM item_recommendations")

        if recommendation_rows:
            cursor.executemany(
                """
                INSERT INTO item_recommendations
                    (item_id, recommended_item_id, score, model_name, trained_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                recommendation_rows,
            )

        cursor.execute(
            """
            INSERT INTO ml_model_runs
                (trained_at, model_name, hit_at_3, mrr_at_3,
                 n_train_orders, n_val_orders, n_test_orders, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            run_row,
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def main():
    raw = load_orders()
    order_count = raw["order_id"].nunique() if not raw.empty else 0

    if order_count < MIN_ORDERS:
        raise SystemExit(
            f"Only {order_count} orders found; at least {MIN_ORDERS} are "
            "required. Run: cd server && npm run db:seed-orders"
        )

    print(f"Loaded {order_count} orders from MySQL")

    X, order_ids, item_ids, order_dates = build_binary_matrix(raw)
    if X.shape[0] < 3:
        raise SystemExit(
            "Not enough orders with at least 2 distinct items to train a model."
        )

    X_train, X_val, X_test, split_info = split_by_date(X, order_dates)

    print("Tuning co-occurrence min_support on validation...")
    best_support, support_results = tune_cooccurrence(X_train, X_val)

    candidate_models = {
        "popularity": build_popularity_model(X_train),
        "cooccurrence": build_cooccurrence_model(X_train, best_support),
        "cosine": build_cosine_model(X_train),
    }

    print("Evaluating candidate models:")
    model_results = {}
    for name, model in candidate_models.items():
        validation_metrics = evaluate(model, X_val, "validation")
        test_metrics = evaluate(model, X_test, "test")
        model_results[name] = {
            "validation": validation_metrics,
            "test": test_metrics,
        }

    best_name = sorted(
        model_results,
        key=lambda name: (
            -model_results[name]["validation"]["hit_at_3"],
            -model_results[name]["validation"]["mrr_at_3"],
            name,
        ),
    )[0]

    print(
        f"\nSelected model by validation Hit@3: {best_name} "
        f"(validation Hit@3={model_results[best_name]['validation']['hit_at_3']:.3f})"
    )

    X_train_val = np.vstack([X_train, X_val])
    if best_name == "popularity":
        final_model = build_popularity_model(X_train_val)
    elif best_name == "cooccurrence":
        final_model = build_cooccurrence_model(X_train_val, best_support)
    else:
        final_model = build_cosine_model(X_train_val)

    print("Final test metrics (retrained on train + validation):")
    final_test_metrics = evaluate(final_model, X_test, "test (retrained)")

    trained_at = datetime.now().replace(microsecond=0)
    fallback_popularity = popularity_vector(X_train_val)
    recommendation_rows = build_recommendation_rows(
        final_model.score_matrix,
        item_ids,
        fallback_popularity,
        final_model.name,
        trained_at,
    )

    metrics_payload = {
        "generated_at": trained_at.isoformat(),
        "random_state": RANDOM_STATE,
        "top_k": TOP_K,
        "n_recommendations": N_RECOMMENDATIONS,
        "split": split_info,
        "cooccurrence_support_sweep": support_results,
        "models": model_results,
        "selection": {
            "metric": "validation_hit_at_3",
            "selected_model": best_name,
            "cooccurrence_min_support": best_support,
            "retrained_on": "train+validation",
        },
        "final_test": final_test_metrics,
        "recommendation_rows": len(recommendation_rows),
    }

    notes_json = json.dumps(metrics_payload, default=str)
    run_row = (
        trained_at,
        final_model.name,
        final_test_metrics["hit_at_3"],
        final_test_metrics["mrr_at_3"],
        int(X_train.shape[0]),
        int(X_val.shape[0]),
        int(X_test.shape[0]),
        notes_json,
    )

    write_database_outputs(recommendation_rows, run_row)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    metrics_path = ARTIFACTS_DIR / "metrics.json"
    chart_path = ARTIFACTS_DIR / "hit_at_3.png"

    with open(metrics_path, "w", encoding="utf-8") as metrics_file:
        json.dump(metrics_payload, metrics_file, indent=2, default=str)

    plot_hit_at_3(model_results, chart_path)

    print(f"\nWrote {len(recommendation_rows)} rows to item_recommendations")
    print(f"Inserted 1 ml_model_runs row for {final_model.name}")
    print(f"Wrote {metrics_path}")
    print(f"Wrote {chart_path}")


if __name__ == "__main__":
    main()
