const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../src/config/db');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const EVIDENCE_PATH = process.env.EVIDENCE_PATH || path.join(__dirname, '..', '..', '05_Testing', 'Test_Evidence', 'ml-api-test-run.txt');

const CART_SIZE = 2;
const LIMIT = 3;
const TOP_PAIRS_LIMIT = 5;
const INVALID_ITEM_COUNT = 21;
const MISSING_PARAM_LIMIT = 3;

const output = [];
const results = [];

function log(line = '') {
  output.push(line);
  console.log(line);
}

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}

function beginCase(id, title, input, expected) {
  log('');
  log('-'.repeat(78));
  log(`ID:      ${id}`);
  log(`Title:   ${title}`);
  log(`Input:   ${input}`);
  log(`Expected: ${expected}`);
}

function endCase(id, actual, passed) {
  log(`Actual:  ${actual}`);
  log(`Result:  ${passed ? 'PASS' : 'FAIL'}`);
  log('-'.repeat(78));
  results.push({ id, passed });
}

function money(value) {
  return Number(value).toFixed(2);
}

function closeTo(actual, expected, tolerance = 1e-6) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

let cartIds = [];
let anchorId = null;
let topRecommendedId = null;
let recommendationRowCount = 0;

async function setup() {
  const [rows] = await pool.query(
    `SELECT r.item_id, r.recommended_item_id, r.score,
            m.name AS recommended_name, m.is_available
     FROM item_recommendations r
     JOIN menu_items m ON m.item_id = r.recommended_item_id
     ORDER BY r.item_id ASC, r.score DESC, r.recommended_item_id ASC`
  );

  recommendationRowCount = rows.length;
  assert.ok(
    recommendationRowCount > 0,
    'item_recommendations is empty - run "npm run ml:train" before the ML API tests'
  );

  const anchors = [];
  for (const row of rows) {
    const id = Number(row.item_id);
    if (!anchors.includes(id)) anchors.push(id);
    if (anchors.length === CART_SIZE) break;
  }

  cartIds = anchors;
  anchorId = anchors[0];

  const topRow = rows.find(
    (row) =>
      Number(row.item_id) === anchorId &&
      Number(row.recommended_item_id) !== anchorId &&
      Boolean(row.is_available)
  );
  assert.ok(
    topRow,
    `item ${anchorId} has no available recommendation - rerun "npm run ml:train"`
  );
  topRecommendedId = Number(topRow.recommended_item_id);
}

async function expectedRecommendations(itemIds, limit) {
  const [rows] = await pool.query(
    `SELECT item_id, recommended_item_id, score
     FROM item_recommendations
     WHERE item_id IN (?)`,
    [itemIds]
  );

  const totals = new Map();
  for (const row of rows) {
    const recommendedId = Number(row.recommended_item_id);
    if (itemIds.includes(recommendedId)) continue;
    totals.set(recommendedId, (totals.get(recommendedId) || 0) + Number(row.score));
  }

  const candidateIds = [...totals.keys()];
  if (candidateIds.length === 0) return [];

  const [menuRows] = await pool.query(
    `SELECT m.item_id, m.name, m.price, m.is_available, c.name AS category
     FROM menu_items m
     JOIN categories c ON c.category_id = m.category_id
     WHERE m.item_id IN (?)`,
    [candidateIds]
  );
  const byId = new Map(menuRows.map((row) => [Number(row.item_id), row]));

  return candidateIds
    .map((id) => byId.get(id))
    .filter((row) => row && Boolean(row.is_available))
    .map((row) => ({
      item_id: Number(row.item_id),
      name: row.name,
      price: Number(row.price),
      category: row.category,
      score: totals.get(Number(row.item_id)),
    }))
    .sort((a, b) => b.score - a.score || a.item_id - b.item_id)
    .slice(0, limit);
}

// tc1 - valid cart
async function tc1() {
  const cart = cartIds.join(',');
  beginCase(
    'TC1',
    'Valid cart recommendations',
    `GET /api/ml/recommendations?item_ids=${cart}&limit=${LIMIT}`,
    `HTTP 200, { data: [...] } with at most ${LIMIT} available items, summed scores, no cart items, score descending`
  );

  try {
    const res = await request(`/api/ml/recommendations?item_ids=${cart}&limit=${LIMIT}`);
    assert.equal(res.status, 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data), 'response "data" is not an array');

    const data = res.body.data;
    const expected = await expectedRecommendations(cartIds, LIMIT);

    assert.deepEqual(
      data.map((row) => row.item_id),
      expected.map((row) => row.item_id),
      'recommended item ids/order do not match the summed item_recommendations scores'
    );
    assert.ok(data.length <= LIMIT, `expected at most ${LIMIT} rows, got ${data.length}`);

    const requiredKeys = ['item_id', 'name', 'price', 'category', 'score'];
    for (const row of data) {
      assert.deepEqual(Object.keys(row).sort(), [...requiredKeys].sort(), `unexpected keys in ${JSON.stringify(row)}`);
      assert.equal(typeof row.name, 'string');
      assert.equal(typeof row.category, 'string');
      assert.ok(closeTo(row.price, expected.find((e) => e.item_id === row.item_id).price), `price mismatch for item ${row.item_id}`);
      assert.ok(closeTo(row.score, expected.find((e) => e.item_id === row.item_id).score), `score mismatch for item ${row.item_id}`);
      assert.ok(!cartIds.includes(row.item_id), `cart item ${row.item_id} was recommended`);
    }

    const scores = data.map((row) => row.score);
    for (let index = 1; index < scores.length; index += 1) {
      assert.ok(scores[index - 1] >= scores[index], `scores not descending: ${scores.join(', ')}`);
    }

    const summary = data.length === 0
      ? '200, data=[]'
      : `200, ${data.length} row(s): ${data.map((row) => `${row.name} (#${row.item_id}, score ${row.score.toFixed(5)}, ${row.category}, Rs.${money(row.price)})`).join('; ')}`;
    endCase('TC1', summary, true);
  } catch (err) {
    endCase('TC1', err.message, false);
  }
}

// tc2 - cart items are never recommended
async function tc2() {
  beginCase(
    'TC2',
    'Cart items excluded from recommendations',
    `GET /api/ml/recommendations?item_ids=${anchorId}&limit=50, then item_ids=${anchorId},<top recommendation>`,
    `The top recommendation for item ${anchorId} appears alone, then disappears once it is added to the cart, along with the cart item itself`
  );

  try {
    const alone = await request(`/api/ml/recommendations?item_ids=${anchorId}&limit=50`);
    assert.equal(alone.status, 200, `expected 200, got ${alone.status} ${JSON.stringify(alone.body)}`);
    const aloneIds = alone.body.data.map((row) => row.item_id);
    assert.ok(aloneIds.includes(topRecommendedId), `expected item ${topRecommendedId} in the recommendations for item ${anchorId}`);
    assert.ok(!aloneIds.includes(anchorId), `cart item ${anchorId} was recommended for itself`);

    const withTop = await request(`/api/ml/recommendations?item_ids=${anchorId},${topRecommendedId}&limit=50`);
    assert.equal(withTop.status, 200, `expected 200, got ${withTop.status} ${JSON.stringify(withTop.body)}`);
    const withTopIds = withTop.body.data.map((row) => row.item_id);

    assert.ok(!withTopIds.includes(anchorId), `cart item ${anchorId} was recommended`);
    assert.ok(!withTopIds.includes(topRecommendedId), `cart item ${topRecommendedId} was recommended`);

    const expected = await expectedRecommendations([anchorId, topRecommendedId], 50);
    assert.deepEqual(withTopIds, expected.map((row) => row.item_id), 'recommendations do not match the expected exclusion of cart items');

    endCase(
      'TC2',
      `200, ${topRecommendedId} present with cart=[${anchorId}], absent with cart=[${anchorId},${topRecommendedId}]; both cart ids excluded`,
      true
    );
  } catch (err) {
    endCase('TC2', err.message, false);
  }
}

// tc3 - missing required parameter
async function tc3() {
  beginCase(
    'TC3',
    'Missing item_ids parameter',
    `GET /api/ml/recommendations?limit=${MISSING_PARAM_LIMIT}`,
    'HTTP 400 with a flat { error } body and no { data } envelope'
  );

  try {
    const res = await request(`/api/ml/recommendations?limit=${MISSING_PARAM_LIMIT}`);

    assert.equal(res.status, 400, `expected 400, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(typeof res.body.error, 'string', 'error response did not include an "error" string');
    assert.ok(!('data' in res.body), 'error response should not include a "data" field');

    endCase('TC3', `400 "${res.body.error}"`, true);
  } catch (err) {
    endCase('TC3', err.message, false);
  }
}

// tc4 - too many ids
async function tc4() {
  const ids = Array.from({ length: INVALID_ITEM_COUNT }, (_, index) => index + 1).join(',');
  beginCase(
    'TC4',
    `More than 20 item ids (${INVALID_ITEM_COUNT})`,
    `GET /api/ml/recommendations?item_ids=${ids}`,
    'HTTP 400 with a flat { error } body and no { data } envelope'
  );

  try {
    const res = await request(`/api/ml/recommendations?item_ids=${ids}`);

    assert.equal(res.status, 400, `expected 400, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(typeof res.body.error, 'string', 'error response did not include an "error" string');
    assert.ok(!('data' in res.body), 'error response should not include a "data" field');

    endCase('TC4', `400 "${res.body.error}"`, true);
  } catch (err) {
    endCase('TC4', err.message, false);
  }
}

// tc5 - metrics shape
async function tc5() {
  beginCase(
    'TC5',
    'Latest model run metrics',
    'GET /api/ml/metrics',
    'HTTP 200 with model_name, hit_at_3, mrr_at_3, n_*_orders, trained_at and a "models" array, matching the latest ml_model_runs row'
  );

  try {
    const [rows] = await pool.query(
      `SELECT model_name, hit_at_3, mrr_at_3,
              n_train_orders, n_val_orders, n_test_orders,
              trained_at, notes
       FROM ml_model_runs
       ORDER BY trained_at DESC, run_id DESC
       LIMIT 1`
    );

    const res = await request('/api/ml/metrics');
    assert.equal(res.status, 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`);

    if (rows.length === 0) {
      assert.equal(res.body.data, null, 'expected { data: null } when ml_model_runs is empty');
      endCase('TC5', '200, data=null (no model run)', true);
      return;
    }

    const latest = rows[0];
    const data = res.body.data;
    assert.ok(data && typeof data === 'object', 'expected a metrics object');

    const requiredKeys = [
      'model_name',
      'hit_at_3',
      'mrr_at_3',
      'n_train_orders',
      'n_val_orders',
      'n_test_orders',
      'trained_at',
      'models',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in data, `metrics response missing "${key}"`);
    }

    assert.equal(data.model_name, latest.model_name, `model_name mismatch (${data.model_name} vs ${latest.model_name})`);
    assert.ok(closeTo(data.hit_at_3, latest.hit_at_3), `hit_at_3 mismatch (${data.hit_at_3} vs ${latest.hit_at_3})`);
    assert.ok(closeTo(data.mrr_at_3, latest.mrr_at_3), `mrr_at_3 mismatch (${data.mrr_at_3} vs ${latest.mrr_at_3})`);
    assert.ok(data.hit_at_3 >= 0 && data.hit_at_3 <= 1, 'hit_at_3 is outside 0..1');
    assert.ok(data.mrr_at_3 >= 0 && data.mrr_at_3 <= 1, 'mrr_at_3 is outside 0..1');
    assert.equal(data.n_train_orders, Number(latest.n_train_orders), 'n_train_orders mismatch');
    assert.equal(data.n_val_orders, Number(latest.n_val_orders), 'n_val_orders mismatch');
    assert.equal(data.n_test_orders, Number(latest.n_test_orders), 'n_test_orders mismatch');

    assert.equal(
      new Date(data.trained_at).getTime(),
      new Date(latest.trained_at).getTime(),
      `trained_at mismatch (${data.trained_at} vs ${latest.trained_at})`
    );

    assert.ok(Array.isArray(data.models), `"models" should be an array, got ${typeof data.models}`);
    const notes = latest.notes ? JSON.parse(latest.notes) : {};
    const notedModels = notes.models && !Array.isArray(notes.models) ? Object.keys(notes.models) : [];
    if (notedModels.length > 0) {
      assert.equal(data.models.length, notedModels.length, `expected ${notedModels.length} models, got ${data.models.length}`);
    }
    for (const model of data.models) {
      assert.equal(typeof model.model_name, 'string', `model entry missing model_name: ${JSON.stringify(model)}`);
    }

    endCase(
      'TC5',
      `200, ${data.model_name}, Hit@3=${data.hit_at_3}, MRR@3=${data.mrr_at_3}, splits=${data.n_train_orders}/${data.n_val_orders}/${data.n_test_orders}, models=[${data.models.map((model) => model.model_name).join(', ')}]`,
      true
    );
  } catch (err) {
    endCase('TC5', err.message, false);
  }
}

// tc6 - top pairs
async function tc6() {
  beginCase(
    'TC6',
    'Highest-scored recommendation pairs',
    `GET /api/ml/top-pairs?limit=${TOP_PAIRS_LIMIT}`,
    `HTTP 200 with at most ${TOP_PAIRS_LIMIT} rows, both item names present, score descending`
  );

  try {
    const res = await request(`/api/ml/top-pairs?limit=${TOP_PAIRS_LIMIT}`);
    assert.equal(res.status, 200, `expected 200, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data), 'response "data" is not an array');

    const data = res.body.data;
    assert.ok(data.length <= TOP_PAIRS_LIMIT, `expected at most ${TOP_PAIRS_LIMIT} rows, got ${data.length}`);

    const [rows] = await pool.query(
      `SELECT r.item_id, mi.name AS item_name,
              r.recommended_item_id, mr.name AS recommended_item_name,
              r.score
       FROM item_recommendations r
       JOIN menu_items mi ON mi.item_id = r.item_id
       JOIN menu_items mr ON mr.item_id = r.recommended_item_id
       ORDER BY r.score DESC, r.item_id ASC, r.recommended_item_id ASC
       LIMIT ?`,
      [TOP_PAIRS_LIMIT]
    );

    assert.deepEqual(
      data.map((row) => [row.item_id, row.recommended_item_id]),
      rows.map((row) => [Number(row.item_id), Number(row.recommended_item_id)]),
      'top pairs do not match the highest-scored item_recommendations rows'
    );

    for (const row of data) {
      assert.equal(typeof row.item_name, 'string');
      assert.equal(typeof row.recommended_item_name, 'string');
      assert.ok(row.item_name.length > 0 && row.recommended_item_name.length > 0, 'missing item name');
    }

    const scores = data.map((row) => row.score);
    for (let index = 1; index < scores.length; index += 1) {
      assert.ok(scores[index - 1] >= scores[index], `scores not descending: ${scores.join(', ')}`);
    }

    const summary = data.length === 0
      ? '200, data=[]'
      : `200, ${data.length} row(s), top: ${data[0].item_name} -> ${data[0].recommended_item_name} (${data[0].score.toFixed(5)})`;
    endCase('TC6', summary, true);
  } catch (err) {
    endCase('TC6', err.message, false);
  }
}

async function run() {
  log('='.repeat(78));
  log('HackA47 RestroManager - ML API Test Suite');
  log('='.repeat(78));
  log(`Base URL:      ${BASE_URL}`);
  log(`Runner:        node:test-free (node:assert + global fetch), no test framework installed`);
  log(`Evidence file: ${EVIDENCE_PATH}`);

  const health = await request('/api/health').catch(() => null);
  if (!health || health.status !== 200) {
    log('');
    log(`PRE-FLIGHT FAILED: no API responding at ${BASE_URL}.`);
    log(`Start the server first:  cd server && npm run dev`);
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  log(`Pre-flight:    GET /api/health -> ${health.status} ${JSON.stringify(health.body)}`);

  await setup();
  log(`Fixtures:      item_recommendations has ${recommendationRowCount} rows`);
  log(`               cart item_ids=${cartIds.join(',')}`);
  log(`               top recommendation for item ${anchorId} is item ${topRecommendedId}`);

  const cases = [tc1, tc2, tc3, tc4, tc5, tc6];
  for (const testCase of cases) {
    await testCase();
  }

  await pool.end();

  const failed = results.filter((result) => !result.passed);
  log('');
  log('='.repeat(78));
  log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
  for (const result of results) {
    log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.id}`);
  }
  log('='.repeat(78));

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
  console.log(`\nEvidence saved to ${EVIDENCE_PATH}`);

  if (failed.length > 0) process.exitCode = 1;
}

run().catch(async (err) => {
  log('');
  log(`SUITE ERROR: ${err.message}`);
  try {
    await pool.end();
  } catch {
    // kuch nahi karna
  }
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, `${output.join('\n')}\n`);
  process.exitCode = 1;
});
