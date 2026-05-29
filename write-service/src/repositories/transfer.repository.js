const crypto = require("crypto");
const pool = require("../db");

class TransferRepository {
  async createTransfer(data) {
    const client = await pool.connect();

    const transferId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    const transfer = {
      id: transferId,
      sourceAccount: data.sourceAccount,
      destinationAccount: data.destinationAccount,
      amount: Number(data.amount),
      currency: data.currency || "COP",
      status: "COMPLETED"
    };

    const eventPayload = {
      transferId: transfer.id,
      sourceAccount: transfer.sourceAccount,
      destinationAccount: transfer.destinationAccount,
      amount: transfer.amount,
      currency: transfer.currency,
      status: transfer.status,
      createdAt: new Date().toISOString()
    };

    try {
      await client.query("BEGIN");

      const insertTransferQuery = `
        INSERT INTO transfers (
          id,
          source_account,
          destination_account,
          amount,
          currency,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          source_account,
          destination_account,
          amount,
          currency,
          status,
          created_at;
      `;

      const transferResult = await client.query(insertTransferQuery, [
        transfer.id,
        transfer.sourceAccount,
        transfer.destinationAccount,
        transfer.amount,
        transfer.currency,
        transfer.status
      ]);

      const insertOutboxQuery = `
        INSERT INTO outbox_events (
          id,
          aggregate_id,
          event_type,
          payload
        )
        VALUES ($1, $2, $3, $4);
      `;

      await client.query(insertOutboxQuery, [
        eventId,
        transfer.id,
        "TRANSFER_CREATED",
        JSON.stringify(eventPayload)
      ]);

      await client.query("COMMIT");

      return transferResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findTransferInSql(id) {
    const query = `
      SELECT
        id,
        source_account,
        destination_account,
        amount,
        currency,
        status,
        created_at
      FROM transfers
      WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }
}

module.exports = TransferRepository;
