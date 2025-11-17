import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();
const app = express();
const port = process.env.PORT || 2000;
const uri = process.env.DB;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

//listeners
client.connect()
    .then(() => {
        app.listen(port, () => {
            console.log(`Hero Apps Server listening ${port}`);
            console.log(`Hero Apps Server Connected with DB`);
        });
    })
    .catch((err) => {
        console.log(err);
    });

//DB & collections
const database = client.db("ZapShift");
const divisions = database.collection("divisions");

app.get("/", async (req, res) => res.send("Server is getting!"))
app.get("/division", async (req, res) => {
    const result = await divisions.find().toArray()
    res.send(result)
})