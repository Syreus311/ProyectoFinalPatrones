const pool = require("./postgres");
const connectMongo = require("./mongo");

const SYNC_DELAY_SECONDS = Number(process.env.SYNC_DELAY_SECONDS || 30);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getPendingEvents() {
  const query = `
    UPDATE outbox_events
    SET attempts = attempts + 1
    WHERE id IN (
      SELECT id
      FROM outbox_events
      WHERE processed_at IS NULL
        AND created_at <= NOW() - ($1::int * INTERVAL '1 second')
      ORDER BY created_at ASC
      LIMIT 10
    )
    RETURNING
      id,
      aggregate_id,
      event_type,
      payload,
      created_at,
      attempts;
  `;

  const result = await pool.query(query, [SYNC_DELAY_SECONDS]);
  return result.rows;
}

async function markEventAsProcessed(eventId) {
  const query = `
    UPDATE outbox_events
    SET processed_at = NOW(),
        last_error = NULL
    WHERE id = $1;
  `;

  await pool.query(query, [eventId]);
}

async function markEventAsFailed(eventId, error) {
  const query = `
    UPDATE outbox_events
    SET last_error = $2
    WHERE id = $1;
  `;

  await pool.query(query, [eventId, error.message]);
}

async function processTransferCreated(event) {
  const db = await connectMongo();
  const collection = db.collection("transfers");

  const payload = event.payload;

  const readModel = {
    transferId: payload.transferId,
    sourceAccount: payload.sourceAccount,
    destinationAccount: payload.destinationAccount,
    amount: payload.amount,
    currency: payload.currency,
    status: payload.status,
    createdAt: payload.createdAt,
    syncedAt: new Date().toISOString()
  };

  await collection.updateOne(
    { transferId: readModel.transferId },
    { $set: readModel },
    { upsert: true }
  );
}

async function processEvent(event) {
  if (event.event_type === "TRANSFER_CREATED") {
    await processTransferCreated(event);
    return;
  }

  throw new Error(`Tipo de evento no soportado: ${event.event_type}`);
}

async function runWorker() {
  console.log("Sync Worker iniciado");
  console.log(`Delay de sincronización configurado: ${SYNC_DELAY_SECONDS} segundos`);

  while (true) {
    try {
      const events = await getPendingEvents();

      if (events.length > 0) {
        console.log(`Eventos listos para sincronizar: ${events.length}`);
      }

      for (const event of events) {
        try {
          console.log(`Procesando evento ${event.id} de tipo ${event.event_type}`);

          await processEvent(event);
          await markEventAsProcessed(event.id);

          console.log(`Evento ${event.id} sincronizado correctamente en MongoDB`);
        } catch (error) {
          console.error(`Error procesando evento ${event.id}:`, error.message);
          await markEventAsFailed(event.id, error);
        }
      }
    } catch (error) {
      console.error("Error general del worker:", error.message);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

runWorker();
