const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = require('../config/db');

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../../05_Testing/Test_Evidence/concurrency-demo.txt'
);

const DEMO_TABLE_NUMBER = 3;
const HOLD_MS = 400;

const ISOLATION_LEVEL_SQL = {
  'READ COMMITTED': 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
  'REPEATABLE READ': 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
};

const output = [];

const log = (line = '') => {
  output.push(line);
  console.log(line);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const toMoney = (value) => Number(value).toFixed(2);

const section = (title) => {
  log('');
  log('='.repeat(78));
  log(title);
  log('='.repeat(78));
};

const runDoubleBooking = async () => {
  section('Demo 1 - Double booking');

  const [[table]] = await pool.query(
    'SELECT table_id, table_number, status FROM restaurant_tables WHERE table_number = ?',
    [DEMO_TABLE_NUMBER]
  );
  if (!table) throw new Error(`table ${DEMO_TABLE_NUMBER} does not exist`);
  if (table.status !== 'free') {
    throw new Error(`demo requires table ${DEMO_TABLE_NUMBER} to be free, found "${table.status}"`);
  }

  const tableId = table.table_id;
  const originalStatus = table.status;
  let committedOrderId = null;

  try {
    log(`Table ${table.table_number} starts as "${table.status}" (table_id=${tableId}).`);
    log('');
    log('Case 1a - no locking');
    log('-'.repeat(78));

    const plainA = await pool.getConnection();
    const plainB = await pool.getConnection();
    try {
      await plainA.beginTransaction();
      await plainB.beginTransaction();

      const [[readA]] = await plainA.query(
        'SELECT status FROM restaurant_tables WHERE table_id = ?',
        [tableId]
      );
      const [[readB]] = await plainB.query(
        'SELECT status FROM restaurant_tables WHERE table_id = ?',
        [tableId]
      );
      log(`Connection A reads table ${table.table_number}: "${readA.status}".`);
      log(`Connection B reads table ${table.table_number}: "${readB.status}".`);
      log('Both connections see "free" and both decide the table is bookable.');

      const [insertA] = await plainA.query(
        "INSERT INTO orders (table_id, status) VALUES (?, 'pending')",
        [tableId]
      );
      const [insertB] = await plainB.query(
        "INSERT INTO orders (table_id, status) VALUES (?, 'pending')",
        [tableId]
      );
      log(`Connection A inserts order ${insertA.insertId}.`);
      log(`Connection B inserts order ${insertB.insertId}.`);
      log('Without SELECT ... FOR UPDATE both inserts succeed: the table is double-booked.');

      await plainA.rollback();
      await plainB.rollback();
      log('Both transactions rolled back, so neither demo order is kept.');
    } catch (err) {
      try {
        await plainA.rollback();
      } catch {
      }
      try {
        await plainB.rollback();
      } catch {
      }
      throw err;
    } finally {
      plainA.release();
      plainB.release();
    }

    log('');
    log('Case 1b - SELECT ... FOR UPDATE on the table row');
    log('-'.repeat(78));

    const lockA = await pool.getConnection();
    const lockB = await pool.getConnection();
    try {
      await lockA.beginTransaction();
      await lockB.beginTransaction();

      const [[lockedByA]] = await lockA.query(
        'SELECT status FROM restaurant_tables WHERE table_id = ? FOR UPDATE',
        [tableId]
      );
      log(`Connection A locks table ${table.table_number} and reads "${lockedByA.status}".`);

      const [insertLocked] = await lockA.query(
        "INSERT INTO orders (table_id, status) VALUES (?, 'pending')",
        [tableId]
      );
      committedOrderId = insertLocked.insertId;
      await lockA.query(
        "UPDATE restaurant_tables SET status = 'occupied' WHERE table_id = ?",
        [tableId]
      );
      log(`Connection A inserts order ${committedOrderId} and marks the table "occupied", still holding the lock.`);

      const startedAt = Date.now();
      const lockPromise = lockB.query(
        'SELECT status FROM restaurant_tables WHERE table_id = ? FOR UPDATE',
        [tableId]
      );
      await sleep(HOLD_MS);
      log(`Connection B requests SELECT ... FOR UPDATE and waits for the row lock (${HOLD_MS} ms so far).`);

      await lockA.commit();
      log('Connection A commits and releases the lock.');

      const [[lockedByB]] = await lockPromise;
      const waitedMs = Date.now() - startedAt;
      log(`Connection B acquires the lock after about ${waitedMs} ms and reads "${lockedByB.status}".`);

      if (lockedByB.status !== 'occupied') {
        throw new Error(`expected connection B to read "occupied", got "${lockedByB.status}"`);
      }

      await lockB.rollback();
      log('Connection B sees "occupied" and aborts; it inserts no order.');
    } catch (err) {
      try {
        await lockA.rollback();
      } catch {
      }
      try {
        await lockB.rollback();
      } catch {
      }
      throw err;
    } finally {
      lockA.release();
      lockB.release();
    }
  } finally {
    if (committedOrderId !== null) {
      await pool.execute('DELETE FROM orders WHERE order_id = ?', [committedOrderId]);
    }
    await pool.execute('UPDATE restaurant_tables SET status = ? WHERE table_id = ?', [
      originalStatus,
      tableId,
    ]);
    log('');
    log(`Cleanup: removed demo order ${committedOrderId === null ? '(none)' : committedOrderId} and restored table ${table.table_number} to "${originalStatus}".`);
  }
};

const runIsolation = async () => {
  section('Demo 2 - Isolation levels');

  const [[item]] = await pool.query(
    'SELECT item_id, name, price FROM menu_items ORDER BY item_id LIMIT 1'
  );
  if (!item) throw new Error('no menu item available for the isolation demo');

  const itemId = item.item_id;
  const originalPrice = Number(item.price);
  const changedPrice = Number((originalPrice + 1).toFixed(2));

  const runScenario = async (level, shouldSeeChange) => {
    log('');
    log(`${level}`);
    log('-'.repeat(78));

    const reader = await pool.getConnection();
    const writer = await pool.getConnection();
    try {
      await reader.query(ISOLATION_LEVEL_SQL[level]);
      await reader.beginTransaction();

      const [[before]] = await reader.query(
        'SELECT price FROM menu_items WHERE item_id = ?',
        [itemId]
      );
      log(`Reader first read for item ${itemId} "${item.name}": Rs.${toMoney(before.price)}.`);

      await writer.beginTransaction();
      await writer.query('UPDATE menu_items SET price = ? WHERE item_id = ?', [
        changedPrice,
        itemId,
      ]);
      await writer.commit();
      log(`Writer commits the price change to Rs.${toMoney(changedPrice)}.`);

      const [[after]] = await reader.query(
        'SELECT price FROM menu_items WHERE item_id = ?',
        [itemId]
      );
      const sawChange = Number(after.price) === changedPrice;
      log(`Reader second read inside the same transaction: Rs.${toMoney(after.price)}.`);

      if (sawChange !== shouldSeeChange) {
        throw new Error(
          `expected ${level} ${shouldSeeChange ? 'to see' : 'not to see'} the committed price change`
        );
      }

      log(
        sawChange
          ? 'The second read sees the other transaction\'s committed change.'
          : 'The second read still sees the original snapshot; the committed change is invisible.'
      );

      await reader.rollback();
    } catch (err) {
      try {
        await reader.rollback();
      } catch {
      }
      try {
        await writer.rollback();
      } catch {
      }
      throw err;
    } finally {
      reader.release();
      writer.release();
      await pool.execute('UPDATE menu_items SET price = ? WHERE item_id = ?', [
        originalPrice,
        itemId,
      ]);
      log(`Restored item ${itemId} price to Rs.${toMoney(originalPrice)}.`);
    }
  };

  await runScenario('READ COMMITTED', true);
  await runScenario('REPEATABLE READ', false);
};

const runDeadlock = async () => {
  section('Demo 3 - Deadlock');

  const [items] = await pool.query(
    'SELECT item_id, name FROM menu_items ORDER BY item_id LIMIT 2'
  );
  if (items.length < 2) throw new Error('need at least two menu items for the deadlock demo');

  const first = items[0];
  const second = items[1];

  log(`Connection A will lock item ${first.item_id} ("${first.name}") then item ${second.item_id} ("${second.name}").`);
  log(`Connection B will lock them in the opposite order.`);

  const connA = await pool.getConnection();
  const connB = await pool.getConnection();
  try {
    await connA.beginTransaction();
    await connB.beginTransaction();

    await connA.query('SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE', [
      first.item_id,
    ]);
    log(`Connection A locks item ${first.item_id}.`);

    await connB.query('SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE', [
      second.item_id,
    ]);
    log(`Connection B locks item ${second.item_id}.`);

    const secondLockA = connA.query(
      'SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE',
      [second.item_id]
    );
    await sleep(150);
    log(`Connection A requests item ${second.item_id}, held by B, and waits.`);

    const secondLockB = connB.query(
      'SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE',
      [first.item_id]
    );
    log(`Connection B requests item ${first.item_id}, held by A, and waits; the cycle is closed.`);

    const outcomes = await Promise.allSettled([secondLockA, secondLockB]);
    const deadlocked = outcomes.find(
      (outcome) =>
        outcome.status === 'rejected' &&
        (outcome.reason.errno === 1213 || outcome.reason.code === 'ER_LOCK_DEADLOCK')
    );

    if (!deadlocked) {
      throw new Error('MySQL did not report a deadlock (expected error 1213)');
    }

    log(`MySQL reports error ${deadlocked.reason.errno} (${deadlocked.reason.code}) and rolls one transaction back.`);

    await connA.rollback();
    await connB.rollback();
    log('Both transactions are closed; no data was changed.');

    const retry = await pool.getConnection();
    try {
      await retry.beginTransaction();
      await retry.query('SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE', [
        first.item_id,
      ]);
      await retry.query('SELECT item_id FROM menu_items WHERE item_id = ? FOR UPDATE', [
        second.item_id,
      ]);
      log(`Retry transaction locks item ${first.item_id} then item ${second.item_id} in a consistent order and succeeds.`);
      await retry.rollback();
      log('Retry transaction rolled back after proving the consistent lock order works.');
    } catch (err) {
      try {
        await retry.rollback();
      } catch {
      }
      throw err;
    } finally {
      retry.release();
    }
  } catch (err) {
    try {
      await connA.rollback();
    } catch {
    }
    try {
      await connB.rollback();
    } catch {
    }
    throw err;
  } finally {
    connA.release();
    connB.release();
  }
};

const run = async () => {
  log('='.repeat(78));
  log('HackA47 RestroManager - Concurrency Demo');
  log('='.repeat(78));
  log('Three experiments use separate mysql2 connections. Data changes are');
  log('committed only where an experiment requires another transaction to see');
  log('them, and every committed change is cleaned up afterwards.');

  await runDoubleBooking();
  await runIsolation();
  await runDeadlock();

  log('');
  log('='.repeat(78));
  log('All three experiments completed.');
  log('='.repeat(78));
};

run()
  .catch((err) => {
    log('');
    log(`DEMO ERROR: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${output.join('\n')}\n`, 'utf8');
    console.log(`\nEvidence saved to ${OUTPUT_PATH}`);
  });
