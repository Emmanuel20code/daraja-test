require("dotenv").config();

const express = require("express");
const axios = require("axios");
const moment = require("moment");

const app = express();

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

 const phone = req.body.phone || "254113745960";
 const amount = req.body.amount || 1;


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
