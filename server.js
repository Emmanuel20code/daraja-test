require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");
const moment = require("moment");


const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log("Database connected successfully."))
  .catch((err) => console.error("Database connection failed:", err));

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS packages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      duration TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS download_speed INTEGER DEFAULT 5
`);

await pool.query(`
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS upload_speed INTEGER DEFAULT 5
`);

await pool.query(`
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS device_limit INTEGER DEFAULT 1
`);

await pool.query(`
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS description TEXT
`);

await pool.query(`
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE
`);
  await pool.query(`
  CREATE TABLE IF NOT EXISTS routers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    ip_address TEXT,
    api_username TEXT,
    api_password TEXT,
    status TEXT DEFAULT 'offline',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    mac_address TEXT,
    username TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
  await pool.query(`
  CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    mac_address TEXT NOT NULL UNIQUE,
    device_name TEXT,
    ip_address TEXT,
    router_id INTEGER REFERENCES routers(id),
    status TEXT DEFAULT 'active',
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    phone TEXT NOT NULL,
    amount INTEGER NOT NULL,
    package_id INTEGER REFERENCES packages(id),
    merchant_request_id TEXT,
    checkout_request_id TEXT UNIQUE,
    mpesa_receipt TEXT,
    status TEXT DEFAULT 'pending',
    result_code INTEGER,
    result_description TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
  await pool.query(`
  ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS merchant_request_id TEXT
`);

await pool.query(`
  ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS checkout_request_id TEXT UNIQUE
`);

await pool.query(`
  ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS result_code INTEGER
`);

await pool.query(`
  ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS result_description TEXT
`);

await pool.query(`
  ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
`);

  await pool.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    router_id INTEGER,
    package_id INTEGER,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_time TIMESTAMP,
    status TEXT DEFAULT 'active'
  )
`);
  await pool.query(`
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS device_id INTEGER
`);

await pool.query(`
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS ip_address TEXT
`);

await pool.query(`
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
`);
  await pool.query(`
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS full_name TEXT
`);

await pool.query(`
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS email TEXT
`);

await pool.query(`
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
`);

  console.log("Database tables ready.");
}

createTables();

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const MPESA_BASE_URL =
  process.env.MPESA_ENV === "sandbox"
    ? "https://sandbox.safaricom.co.ke"
    : "https://api.safaricom.co.ke";


// Test



// Get token
async function getAccessToken() {

  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");


  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers:{
        Authorization:`Basic ${auth}`
      }
    }
  );


  return response.data.access_token;
}


// Token test
app.get("/token", async(req,res)=>{

 try{

  const token = await getAccessToken();

  res.json({
    access_token: token
  });

 }catch(error){

  res.status(500).json(
    error.response?.data || error.message
  );

 }

});


// STK Push
app.post("/stkpush", async(req,res)=>{

 try{

 const { phone, packageId } = req.body;

const packageResult = await pool.query(
  "SELECT * FROM packages WHERE id = $1",
  [packageId]
);

if (packageResult.rows.length === 0) {
  return res.status(404).json({
    error: "Package not found"
  });
}

const selectedPackage = packageResult.rows[0];
const amount = selectedPackage.price;
const payment = await pool.query(
  `INSERT INTO payments
   (phone, amount, package_id, status)
   VALUES ($1, $2, $3, 'pending')
   RETURNING id`,
  [phone, amount, packageId]
);

const paymentId = payment.rows[0].id;
   
await pool.query(
  `UPDATE payments
   SET merchant_request_id = $1,
       checkout_request_id = $2
   WHERE id = $3`,
  [
    response.data.MerchantRequestID,
    response.data.CheckoutRequestID,
    paymentId
  ]
);
 const token = await getAccessToken();


 const timestamp = moment()
 .format("YYYYMMDDHHmmss");


 const password = Buffer.from(
 `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
 )
 .toString("base64");


 const payload={

 BusinessShortCode:process.env.MPESA_SHORTCODE,

 Password:password,

 Timestamp:timestamp,


 // PAYBILL
 
TransactionType: "CustomerBuyGoodsOnline",

 Amount:amount,

 PartyA:phone,

 PartyB:process.env.MPESA_SHORTCODE,

 PhoneNumber:phone,


 CallBackURL:process.env.MPESA_CALLBACK_URL,


 AccountReference:"WiFi Payment",

 TransactionDesc:"WiFi Package Payment"

 };


 console.log("Sending STK:",payload);


 const response = await axios.post(

 `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,

 payload,

 {
 headers:{
 Authorization:`Bearer ${token}`
 }
 }

 );
   
console.log("Safaricom Response:", response.data);

 res.json(response.data);



 }catch(error){

 console.log(
 error.response?.data || error.message
 );


 res.status(500).json(
 error.response?.data || error.message
 );

 }

});



// Callback
app.post("/callback",(req,res)=>{


console.log(
"MPESA CALLBACK:"
);


console.log(
JSON.stringify(req.body,null,2)
);


res.json({

ResultCode:0,

ResultDesc:"Accepted"

});


});



app.listen(PORT,()=>{

console.log(
`Server running on port ${PORT}`
);

});
