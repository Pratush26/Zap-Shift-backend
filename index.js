import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 2000;
const uri = process.env.DB;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Server is getting!"))

app.listen(PORT, () => console.log(`server running on port: ${PORT}`))