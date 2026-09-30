const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const results = [];

function record(step, passed, status, detail) {
  results.push({ step, passed, status, detail });
  const tag = passed ? 'PASS' : 'FAIL';
  const code = status === null ? '---' : status;
  console.log(`${tag}  step ${step}  [${code}]  ${detail}`);
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

const state = { createdItemId: null, categoryId: null };

// 1. GET /api/categories -> 200 and an array
async function step1() {
  const { status, body } = await request('/api/categories');
  const items = body && Array.isArray(body.data) ? body.data : null;

  if (status !== 200) {
    return record(1, false, status, `GET /api/categories expected 200, got ${status}`);
  }
  if (!items) {
    return record(1, false, status, 'GET /api/categories expected an array at body.data');
  }
  state.categoryId = items.length > 0 ? items[0].category_id : null;
  return record(1, true, status, `GET /api/categories returned ${items.length} categories`);
}

// 2. GET /api/menu -> 200 and at least 12 items
async function step2() {
  const { status, body } = await request('/api/menu');
  const items = body && Array.isArray(body.data) ? body.data : null;

  if (status !== 200) {
    return record(2, false, status, `GET /api/menu expected 200, got ${status}`);
  }
  if (!items) {
    return record(2, false, status, 'GET /api/menu expected an array at body.data');
  }
  if (items.length < 12) {
    return record(2, false, status, `GET /api/menu expected >= 12 items, got ${items.length}`);
  }
  return record(2, true, status, `GET /api/menu returned ${items.length} items`);
}

// 3. GET /api/menu?search=chicken -> only matching items
async function step3() {
  const { status, body } = await request('/api/menu?search=chicken');
  const items = body && Array.isArray(body.data) ? body.data : null;

  if (status !== 200) {
    return record(3, false, status, `GET /api/menu?search=chicken expected 200, got ${status}`);
  }
  if (!items) {
    return record(3, false, status, 'GET /api/menu?search=chicken expected an array at body.data');
  }
  const strays = items.filter((i) => !String(i.name).toLowerCase().includes('chicken'));
  if (strays.length > 0) {
    return record(3, false, status, `search=chicken returned non-matching item(s): ${strays.map((i) => i.name).join(', ')}`);
  }
  return record(3, true, status, `search=chicken matched ${items.length} item(s): ${items.map((i) => i.name).join(', ') || '(none)'}`);
}

// 4. POST /api/menu -> 201 and the created row
async function step4() {
  if (state.categoryId === null) {
    return record(4, false, null, 'no category available to build a valid test item (step 1 must pass first)');
  }

  const payload = { name: 'Test Automation Special', category_id: state.categoryId, price: 12.5 };
  const { status, body } = await request('/api/menu', { method: 'POST', body: JSON.stringify(payload) });

  if (status !== 201) {
    const reason = body && body.error ? ` - ${body.error}` : '';
    return record(4, false, status, `POST /api/menu expected 201, got ${status}${reason}`);
  }

  const created = body && body.data;
  if (!created || created.item_id === undefined) {
    return record(4, false, status, 'POST /api/menu expected the created row at body.data');
  }
  if (created.name !== payload.name || Number(created.price) !== payload.price || Number(created.category_id) !== Number(payload.category_id)) {
    return record(4, false, status, `POST /api/menu created row does not match request: ${JSON.stringify(created)}`);
  }

  state.createdItemId = created.item_id;
  return record(4, true, status, `POST /api/menu created item_id=${created.item_id} "${created.name}" @ ${created.price}`);
}

// 5. PUT the new item's price -> 200 and updated price
async function step5() {
  if (state.createdItemId === null) {
    return record(5, false, null, 'no created item available to update (step 4 must pass first)');
  }

  const newPrice = 21.75;
  const { status, body } = await request(`/api/menu/${state.createdItemId}`, {
    method: 'PUT',
    body: JSON.stringify({ price: newPrice }),
  });

  if (status !== 200) {
    const reason = body && body.error ? ` - ${body.error}` : '';
    return record(5, false, status, `PUT /api/menu/${state.createdItemId} expected 200, got ${status}${reason}`);
  }

  const updated = body && body.data;
  if (!updated || Number(updated.price) !== newPrice) {
    return record(5, false, status, `PUT price expected ${newPrice}, got ${updated ? updated.price : 'no body'}`);
  }

  return record(5, true, status, `PUT /api/menu/${state.createdItemId} price ${updated.price}`);
}

// 6. DELETE the new item -> 200 or 204
async function step6() {
  if (state.createdItemId === null) {
    return record(6, false, null, 'no created item available to delete (step 4 must pass first)');
  }

  const id = state.createdItemId;
  const { status } = await request(`/api/menu/${id}`, { method: 'DELETE' });

  if (status !== 200 && status !== 204) {
    return record(6, false, status, `DELETE /api/menu/${id} expected 200 or 204, got ${status}`);
  }

  const { status: afterStatus } = await request(`/api/menu/${id}`);
  if (afterStatus !== 404) {
    return record(6, false, status, `DELETE /api/menu/${id} succeeded but the item still resolves (GET returned ${afterStatus})`);
  }

  return record(6, true, status, `DELETE /api/menu/${id} removed it (subsequent GET is 404)`);
}

// 7. GET /api/menu/999999 -> 404
async function step7() {
  const { status } = await request('/api/menu/999999');

  if (status !== 404) {
    return record(7, false, status, `GET /api/menu/999999 expected 404, got ${status}`);
  }
  return record(7, true, status, 'GET /api/menu/999999 returned 404');
}

async function run() {
  console.log(`Testing menu API at ${BASE_URL}\n`);

  const steps = [step1, step2, step3, step4, step5, step6, step7];

  // Best-effort cleanup so a mid-run failure never leaves a test item behind
  async function cleanup() {
    if (state.createdItemId === null) return;
    try {
      await request(`/api/menu/${state.createdItemId}`, { method: 'DELETE' });
      console.log(`\ncleanup: removed test item_id=${state.createdItemId}`);
    } catch {
      console.log(`\ncleanup: could not remove test item_id=${state.createdItemId}`);
    }
  }

  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      record(Number(step.name.replace('step', '')), false, null, `threw ${err.message} - is the server running on port ${new URL(BASE_URL).port}?`);
    }
  }

  await cleanup();

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed steps: ' + failed.map((r) => r.step).join(', '));
    process.exitCode = 1;
  }
}

run();