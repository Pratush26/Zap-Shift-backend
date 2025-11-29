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
const allowedOrigins = process.env.FRONTEND_URLS.split(",");

app.use(express.json());
app.use(cors({
    origin: allowedOrigins ? allowedOrigins : ['http://localhost:5173']
}));

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
    try {
        const result = await reviewSet.find().toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/services", async (req, res) => {
    try {
        const result = await serviceSet.find().toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/ware-houses", async (req, res) => {
    try {
        const result = await wareHouseSet.find({ status: "active" }).project({ city: 0, status: 0, flowchart: 0 }).sort({ district: 1 }).toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/branches", async (req, res) => {
    try {
        const result = await wareHouseSet.find({ status: "active" }).project({ district: 1, region: 1 }).sort({ district: 1 }).toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/divisions", async (req, res) => {
    try {
        const result = await divisionSet.find().toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/track-parcel/:id", async (req, res) => {
    try {
        const result = await parcelSet.findOne({ _id: new ObjectId(req.params.id) })
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return {};
    }
})
app.get("/track-deliveries", async (req, res) => {
    try {
        const today = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);

        const statesResult = await parcelSet.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
        ]).toArray()

        const deliveriesResult = await parcelSet.aggregate([
            { $unwind: "$state" },
            {
                $match: {
                    "state.title": "Delivered",
                    "state.createdAt": {
                        $gte: lastWeek.toISOString(),
                    }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$state.createdAt" } } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]).toArray()

        res.send({ statesResult, deliveriesResult })
    } catch (error) {
        console.error("DB error: ", error)
        return { statesResult: [], deliveriesResult: [] };
    }
})
app.get("/rider-deliveries", async (req, res) => {
    try {
        const pipeline = [
            { $unwind: "$state" },
            {
                $match: {
                    "state.title": "Delivered",
                    "riderEmail": req.query.email
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$state.createdAt" } } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]
        const result = await parcelSet.aggregate(pipeline).toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/parcel-data", async (req, res) => {
    try {
        const { email = "", status = "", limit = 10, skip = 0 } = req.query
        const query = {}
        if (!!email) {
            query.$or = [
                { createdBy: email },
                { senderEmail: email }
            ];
        }
        if (!!status) query.status = status;

        const result = await parcelSet
            .find(query)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
})
app.get("/find-employees", async (req, res) => {
    try {
        const { requestedRole = "", status = "", role = "", limit = 10, skip = 0 } = req.query
        const query = {}
        if (!!status) query.status = status;
        if (!!requestedRole) query.requestedRole = requestedRole;
        if (!!role) query.role = role;
        const result = await employeeSet
            .find(query)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .toArray()
        res.send(result)
    } catch (error) {
        console.error("DB error: ", error)
        return [];
    }
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
            },
            $push: {
                state: {
                    title: "Payment Successful",
                    completed: true,
                    createdAt: new Date().toISOString()
                }
            },
        })
        if (session.payment_status !== "paid") res.status(402).send({ message: "There is something wrong with your payment process" })
        else res.send({ cost: session.amount_total / 100, currency: session.currency, parcelId: session.metadata.parcelId })
    }
    else res.status(404).send("Something went wrong!")
})

app.post('/create-checkout-session', async (req, res) => {
    const origin = req.headers.origin;

    if (!allowedOrigins.includes(origin)) {
        return res.status(403).send({ error: "Origin not allowed" });
    }
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
        success_url: `${origin}/after-payment?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/after-payment?success=false`,
    });
    res.send({ url: session.url });
});
