const express = require("express");
const TransferRepository = require("../repositories/transfer.repository");

const router = express.Router();
const transferRepository = new TransferRepository();

router.post("/transfers", async (req, res) => {
  try {
    const { sourceAccount, destinationAccount, amount, currency } = req.body;

    if (!sourceAccount || !destinationAccount || !amount) {
      return res.status(400).json({
        message: "sourceAccount, destinationAccount y amount son obligatorios."
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        message: "El monto debe ser mayor a cero."
      });
    }

    const transfer = await transferRepository.createTransfer({
      sourceAccount,
      destinationAccount,
      amount,
      currency
    });

    return res.status(201).json({
      message: "Transferencia registrada en SQL. La lectura en NoSQL se actualizará de forma eventual.",
      expectedSyncDelaySeconds: 10,
      data: transfer
    });
  } catch (error) {
    console.error("Error creando transferencia:", error);

    return res.status(500).json({
      message: "Error interno creando la transferencia."
    });
  }
});

router.get("/debug/sql/transfers/:id", async (req, res) => {
  try {
    const transfer = await transferRepository.findTransferInSql(req.params.id);

    if (!transfer) {
      return res.status(404).json({
        message: "Transferencia no encontrada en SQL."
      });
    }

    return res.json({
      message: "Transferencia encontrada en SQL.",
      data: transfer
    });
  } catch (error) {
    console.error("Error consultando SQL:", error);

    return res.status(500).json({
      message: "Error consultando SQL."
    });
  }
});

module.exports = router;
