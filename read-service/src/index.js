const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectMongo = require("./db");
const transferRoutes = require("./routes/transfer.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", async (req, res) => {
  await connectMongo();

  res.json({
    service: "read-service",
    status: "ok"
  });
});

app.use("/", transferRoutes);

const PORT = process.env.PORT || 3002;

app.listen(PORT, async () => {
  await connectMongo();
  console.log(`Read Service escuchando en puerto ${PORT}`);
});
