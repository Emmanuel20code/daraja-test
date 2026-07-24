require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;


// Test server
app.get("/", (req, res) => {
  res.send("✅ Daraja Production Server Running");
});


// Get OAuth Token
async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  return response.data.access_token;
}


// Generate timestamp
function getTimestamp() {
  const date = new Date();

  return (
    date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0") +
    String(date.getHours()).padStart(2, "0") +
    String(date.getMinutes()).padStart(2, "0") +
    String(date.getSeconds()).padStart(2, "0")
  );
}


// Generate password
function getPassword(timestamp) {
  return Buffer.from(
    process.env.SHORTCODE +
    process.env.PASSKEY +
    timestamp
  ).toString("base64");
}


// Token test
app.get("/token", async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({
      access_token: token
    });
  } catch(error){

    console.log("STATUS:", error.response?.status);
    console.log("DATA:", error.response?.data);
    console.log("MESSAGE:", error.message);

    res.status(500).json(
      error.response?.data || error.message
    );

}
});


// STK Push
app.post("/stkpush", async (req, res) => {

  try {

    const token = await getAccessToken();

    const timestamp = getTimestamp();

    const password = getPassword(timestamp);


    const response = await axios.post(

      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",

      {
        BusinessShortCode: process.env.SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: 1,
        PartyA: process.env.PHONE,
        PartyB: process.env.SHORTCODE,
        PhoneNumber: process.env.PHONE,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "Test",
        TransactionDesc: "Payment Test"
      },

      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }

    );


    res.json(response.data);


  } catch(error){

    console.log("STATUS:", error.response?.status);
    console.log("DATA:", error.response?.data);
    console.log("MESSAGE:", error.message);

    res.status(500).json(
      error.response?.data || error.message
    );

}

});


// Safaricom callback
app.post("/callback", (req,res)=>{

  console.log(
    "M-PESA CALLBACK:"
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
