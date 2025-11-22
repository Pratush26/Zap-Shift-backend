import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import Stripe from "stripe";

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
const employeeSet = database.collection("employees");
const parcelSet = database.collection("parcels");

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
    const result = await wareHouseSet.find({ status: "active" }).project({ city: 0, status: 0, flowchart: 0 }).toArray()
    res.send(result)
})
app.get("/branches", async (req, res) => {
    const result = await wareHouseSet.find({ status: "active" }).project({ district: 1, region: 1 }).toArray()
    res.send(result)
})
app.get("/divisions", async (req, res) => {
    const result = await divisionSet.find().toArray()
    res.send(result)
})

app.post("/rider-request", async (req, res) => {
    const result = await employeeSet.insertOne({
        ...req.body,
        role: "user",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    })
    res.send(result)
})
app.post("/create-parcel", async (req, res) => {
    const result = await parcelSet.insertOne({
        ...req.body,
        due: parseInt(req.body.due),
        deliveryCost: parseInt(req.body.deliveryCost),
        state: [],
        status: "pending",
        transactionId: {},
        paymentStatus: "unpaid",
        paymentMethod: req.body.paymentMethod || "",
        createdAt: new Date().toISOString(),
    })
    res.send(result)
})
app.patch("/rider-requests-status", async (req, res) => {
    const result = await employeeSet.updateOne({ _id: new ObjectId(req.body.id) }, {
        $set: {
            role: req.body.status === "approved" ? "rider" : "user",
            status: req.body.status,
            updatedAt: new Date().toISOString()
        }
    })
    res.send(result)
})

app.post('/create-checkout-session', async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                price_data: {
                    currency: 'usd',
                    unit_amount: parseInt(req.body.cost) * 100,
                    product_data: {
                        name: req.body.details
                    }
                },
                quantity: 1,
            },
        ],
        customer_email: req.body.senderEmail,
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}?success=true`,
        cancel_url: `${process.env.FRONTEND_URL}?success=false`,
    });

    res.redirect(303, session.url);
});
