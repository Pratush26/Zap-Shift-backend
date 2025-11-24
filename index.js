import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import Stripe from "stripe";
import { priceCalculator } from "./utils/priceCalculator.js";

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
app.get("/track-parcel", async (req, res) => {
    const result = await parcelSet.findOne({_id: new ObjectId(req.body.id)})
    res.send(result)
})

app.post("/rider-request", async (req, res) => {
    const exists = await employeeSet.findOne({ email: req.body.email }, { projection: { email: 1 } })
    if (exists) return res.status(409).send({ message: "You have already submitted a request." })
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

    const deliveryCost = priceCalculator(req.body?.senderDivision, req.body?.receiverDivision, req.body?.parcelType, req.body?.weight)

    const result = await parcelSet.insertOne({
        ...req.body,
        weight: parseFloat(req.body.weight),
        due: parseInt(req.body.due || 0),
        deliveryCost,
        state: [],
        status: "pending",
        transactionId: null,
        paymentStatus: "unpaid",
        paymentMethod: req.body.paymentMethod || null,
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
app.patch("/update-paymentStatus", async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(req.body.session_id);
    if (session.status === "complete") {
        const parcel = await parcelSet.updateOne({ _id: new ObjectId(session.metadata.parcelId), transactionId: null }, {
            $set: {
                paymentStatus: session.payment_status,
                paymentMethod: session.payment_method_types[0] || session.payment_method_types || null,
                transactionId: session.payment_intent,
                updatedAt: new Date().toISOString()
            }
        })
        if (session.payment_status !== "paid") res.status(402).send({ message: "There is something wrong with your payment process" })
        else res.send({ cost: session.amount_total / 100, currency: session.currency })
    }
    else res.status(404).send("Something went wrong!")
})

app.post('/create-checkout-session', async (req, res) => {

    const parcel = await parcelSet.findOne({ _id: new ObjectId(req.body?.parcelId) }, {
        projection: {
            deliveryCost: 1,
            parcelInfo: 1,
            createdBy: 1,
            weight: 1,
            _id: 1
        }
    })
    if (!parcel) return res.status(404).send({ message: "Parcel details not found!" })
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                price_data: {
                    currency: 'BDT',
                    unit_amount: parseFloat(parcel.deliveryCost) * 100,
                    product_data: {
                        name: parcel.parcelInfo
                    }
                },
                quantity: 1,
            },
        ],
        customer_email: parcel.createdBy,
        mode: 'payment',
        metadata: {
            parcelId: parcel._id.toString(),
            weight: parcel.weight
        },
        success_url: `${process.env.FRONTEND_URL}/after-payment?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/after-payment?success=false`,
    });
    res.send({ url: session.url });
});
