# RestroManager — Recommender (Phase 10B)

Python 3.10+ recommender for the RestroManager menu. It reads synthetic order
history from MySQL, trains and evaluates three item recommenders, writes the
best model's top-10 recommendations into `item_recommendations`, records one
run in `ml_model_runs`, and saves evaluation artifacts.

This is the only Python part of the project. Express and React never call this
script at runtime.

## Prerequisites

- MySQL 8.0.16+ running with the RestroManager database created.
- At least 200 orders in the database. Generate them with:
  `cd server && npm run db:seed-orders`
- The ML tables from `server/sql/ml_tables.sql`. They are part of
  `npm run db:init`; note that `db:init` and `db:reset` delete data, so only
  run them when you intend to rebuild the database.

## Database credentials

`config.py` loads `server/.env` (the same file the Express server uses). If
`server/.env` does not exist yet:

```powershell
cd server
copy .env.example .env
```

Fill in `DB_HOST`, `DB_PORT` (optional, defaults to 3306), `DB_USER`,
`DB_PASSWORD`, and `DB_NAME`.

## Set up the virtual environment

From the `ml` folder:

```powershell
# Windows (PowerShell)
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

`ml/.venv` is ignored by Git. On Windows, if `python` is not on `PATH`, use
`py` instead of `python` for every command above.

## Run training

Preferred, from the server folder (matches the `ml:train` npm script):

```powershell
cd server
npm run ml:train
```

Or run the script directly from `ml`:

```powershell
cd ml
.\.venv\Scripts\Activate.ps1
python train_recommender.py
# Windows fallback if python is not on PATH:
py train_recommender.py
```

The npm script invokes `python`; if your Windows machine only exposes the
`py` launcher, use the direct `py train_recommender.py` command above.

## What the script does

1. Loads orders joined to order items, and stops with a clear message when
   there are fewer than 200 orders.
2. Deduplicates items per order, keeps baskets with at least two distinct
   items, and builds a binary order-by-item matrix.
3. Splits by calendar date: first 70% of days for training, next 15% for
   validation, last 15% for testing. It prints and asserts that the date
   ranges do not overlap.
4. Trains three models:
   - popularity baseline;
   - item co-occurrence confidence with `min_support` tuned on validation;
   - item-item cosine similarity from scikit-learn.
5. Hides one seeded item from each test basket, recommends the top 3 items not
   already in the cart, and reports Hit@3, MRR@3, and a seeded 95% bootstrap
   interval for Hit@3.
6. Selects the model by validation Hit@3 only, retrains it on train +
   validation, and reports test metrics for the retrained model.
7. Replaces `item_recommendations` with the top 10 items per menu item, adds
   one `ml_model_runs` row, and writes `artifacts/metrics.json` plus
   `artifacts/hit_at_3.png`.

## Outputs

- `artifacts/metrics.json` — committed; contains split sizes, every model's
  validation and test metrics, the support sweep, and the selected model.
- `artifacts/hit_at_3.png` — generated chart; ignored by Git.
- `item_recommendations` — top 10 recommendations per item from the selected
  model.
- `ml_model_runs` — one row per training run, with all model metrics stored as
  JSON in `notes`.
