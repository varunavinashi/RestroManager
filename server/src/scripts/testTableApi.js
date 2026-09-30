const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const TABLE_ID = 1;
const ORIGINAL_STATUS = 'free';

const results = [];

function record(step, passed, detail) {
  results.push({ step, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  step ${step}  ${detail}`);
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

function tableById(payload, id) {
  const items = payload && Array.isArray(payload.data) ? payload.data : null;
  if (!items) return null;
  return items.find((t) => Number(t.table_id) === id) || null;
}

// 1. Get all tables and show them in the console
async function step1() {
  const { status, body } = await request('/api/tables');
  const items = body && Array.isArray(body.data) ? body.data : null;

  if (status !== 200) {
    return record(1, false, `GET /api/tables expected 200, got ${status}`);
  }
  if (!items) {
    return record(1, false, 'GET /api/tables expected an array at body.data');
  }

  console.log(`      tables (${items.length}):`);
  for (const t of items) {
    console.log(`        table_id=${String(t.table_id).padEnd(4)} table_number=${String(t.table_number).padEnd(4)} capacity=${String(t.capacity).padEnd(4)} status=${t.status}`);
  }

  return record(1, true, `GET /api/tables returned ${items.length} tables`);
}

// 2. Mark table 1 as occupied and make sure that changes remain
async function step2() {
  const put = await request(`/api/tables/${TABLE_ID}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'occupied' }),
  });

  if (put.status !== 200) {
    const reason = put.body && put.body.error ? ` - ${put.body.error}` : '';
    return record(2, false, `PUT occupied expected 200, got ${put.status}${reason}`);
  }

  const after = await request('/api/tables');
  const table = tableById(after.body, TABLE_ID);

  if (!table) {
    return record(2, false, `table ${TABLE_ID} missing from GET /api/tables after the update`);
  }
  if (table.status !== 'occupied') {
    return record(2, false, `table ${TABLE_ID} should be "occupied" after the PUT, but GET shows "${table.status}"`);
  }

  return record(2, true, `table ${TABLE_ID} is now "occupied" (verified via a fresh GET)`);
}

// 3. Trying invalid status to check API is working fine and rejecting it
async function step3() {
  const { status, body } = await request(`/api/tables/${TABLE_ID}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'closed' }),
  });

  if (status !== 400) {
    return record(3, false, `PUT status="closed" expected 400, got ${status}${body && body.data ? ` - it was accepted as "${body.data.status}"` : ''}`);
  }

  // Make sure the failed update didn't change the table
  const after = await request('/api/tables');
  const table = tableById(after.body, TABLE_ID);
  if (table && table.status !== 'occupied') {
    return record(3, false, `PUT returned 400 but table ${TABLE_ID} is now "${table.status}" - the rejected write leaked`);
  }

  return record(3, true, `PUT status="closed" rejected with 400${body && body.error ? `: ${body.error}` : ''}`);
}

async function run() {
  console.log(`Testing table API at ${BASE_URL}\n`);

  for (const step of [step1, step2, step3]) {
    try {
      await step();
    } catch (err) {
      record(Number(step.name.replace('step', '')), false, `threw ${err.message} - is the server running on port ${new URL(BASE_URL).port}?`);
    }
  }

  // Reset table 1 so that we can run the test without changing the seed data
  if (results.find((r) => r.step === 2 && r.passed)) {
    await request(`/api/tables/${TABLE_ID}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: ORIGINAL_STATUS }),
    });
    console.log(`\ncleanup: restored table ${TABLE_ID} status to "${ORIGINAL_STATUS}"`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('Failed steps: ' + failed.map((r) => r.step).join(', '));
    process.exitCode = 1;
  }
}

run();