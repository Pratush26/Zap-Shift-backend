import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

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

//  listeners
client.connect()
    .then(() => app.listen(port, () => console.log(`Hero App's Server listening ${port} and successfully connected with DB.`)))
    .catch((err) => console.log(err))

//  DB & collections
const database = client.db("ZapShift");
const divisionSet = database.collection("divisions");
const reviewSet = database.collection("reviews");
const serviceSet = database.collection("services");
const wareHouseSet = database.collection("wareHouses");

//  Public Api
app.get("/", async (req, res) => res.send("Server is getting!"))
app.get("/reviews", async (req, res) => {
    const result = await reviewSet.find().toArray()
    res.send(result)
})
app.get("/services", async (req, res) => {
    const result = await serviceSet.find().toArray()
    res.send(result)
})
app.get("/ware-houses", async (req, res) => {
    const result = await wareHouseSet.find({status: "active"}).project({city: 0, status: 0, flowchart: 0}).toArray()
    res.send(result)
})
app.get("/branches", async (req, res) => {
    const result = await wareHouseSet.find({status: "active"}).project({district: 1}).toArray()
    res.send(result)
})
app.get("/divisions", async (req, res) => {
    const result = await divisionSet.find().toArray()
    res.send(result)
})