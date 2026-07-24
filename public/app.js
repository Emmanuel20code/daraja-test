async function buyPackage(amount, packageName) {

    const phone = prompt("Enter your M-PESA phone number (e.g. 2547XXXXXXXX):");

    if (!phone) {
        return;
    }

    try {

        const response = await fetch("/stkpush", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                phone: phone,
                amount: amount
            })
        });

        const data = await response.json();

        if (data.ResponseCode === "0") {
            alert("STK Push sent successfully. Check your phone and enter your M-PESA PIN.");
        } else {
            alert(data.ResponseDescription || JSON.stringify(data));
        }

    } catch (error) {

        alert("Unable to contact the server. Please try again.");

    }

}
