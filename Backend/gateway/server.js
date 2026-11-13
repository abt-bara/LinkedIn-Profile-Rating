import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:4173",
    ],
  }),
);
app.get("/", (req, res) => {
  res.send("Hello");
});

app.listen(3000, () => {
  console.log("\n \n --- server is running successfully ---\n \n");
});
