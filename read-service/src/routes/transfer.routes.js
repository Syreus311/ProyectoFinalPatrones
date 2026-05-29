const express = require("express");
const connectMongo = require("../db");

const router = express.Router();

router.get("/transfers", async (req, res) => {
  try {
    const { account } = req.query;

    const db = await connectMongo();
    const collection = db.collection("transfers");

    const filter = account
      ? {
          $or: [
            { sourceAccount: account },
            { destinationAccount: account }
          ]
        }
      : {};

    const transfers = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return res.json({
      source: "MongoDB read model",
      total: transfers.length,
      data: transfers
    });
  } catch (error) {
    console.error("Error consultando transferencias:", error);

    return res.status(500).json({
      message: "Error consultando transferencias en NoSQL."
    });
  }
});

router.get("/transfers/:id", async (req, res) => {
  try {
    const db = await connectMongo();
    const collection = db.collection("transfers");

    const transfer = await collection.findOne({
      transferId: req.params.id
    });

    if (!transfer) {
      return res.status(404).json({
        message: "Transferencia no encontrada en NoSQL. Puede que todavía no esté sincronizada."
      });
    }

    return res.json({
      source: "MongoDB read model",
      data: transfer
    });
  } catch (error) {
    console.error("Error consultando transferencia:", error);

    return res.status(500).json({
      message: "Error consultando transferencia en NoSQL."
    });
  }
});

module.exports = router;
