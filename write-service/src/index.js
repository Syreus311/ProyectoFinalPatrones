const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const transferRoutes = require("./routes/transfer.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({
    service: "write-service",
    status: "ok"
  });
});

app.use("/", transferRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Write Service escuchando en puerto ${PORT}`);
});
