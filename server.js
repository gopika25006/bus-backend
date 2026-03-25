console.log("Server file started");

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

/* ---------------- DATABASE CONNECTION ---------------- */

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Fida@2247",
  database: "smart_bus_system"
});

db.connect((err) => {
  if (err) {
    console.log("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL");
  }
});

/* ---------------- TEST ROUTE ---------------- */

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* ---------------- PASSENGER API ---------------- */

/* Add passenger */
app.post("/passenger", (req, res) => {

  const { name, phone } = req.body;

  const sql = "INSERT INTO passenger (name, phone) VALUES (?, ?)";

  db.query(sql, [name, phone], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.send("Passenger added successfully");
    }

  });

});

/* Get all passengers */

app.get("/users", (req, res) => {

  const sql = "SELECT * FROM users";

  db.query(sql, (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }

  });

});

/* ---------------- SMART CARD API ---------------- */

/* Create smart card */

app.post("/card", (req, res) => {

  const { balance, status, passenger_id } = req.body;

  const sql =
    "INSERT INTO smart_card (balance, status, passenger_id) VALUES (?, ?, ?)";

  db.query(sql, [balance, status, passenger_id], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.send("Smart card created successfully");
    }

  });

});

/* Check balance */

app.get("/balance/:card_id", (req, res) => {

  const card_id = req.params.card_id;

  const sql = "SELECT balance FROM smart_card WHERE card_id = ?";

  db.query(sql, [card_id], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }

  });

});

/* Recharge card */

app.post("/recharge", (req, res) => {

  const { card_id, amount } = req.body;

  const sql =
    "UPDATE smart_card SET balance = balance + ? WHERE card_id = ?";

  db.query(sql, [amount, card_id], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.send("Card recharged successfully");
    }

  });

});

/* ---------------- TRIP API ---------------- */
/* start trip */

app.post("/trip/start", (req, res) => {

  const { entry_stop_id, card_id, bus_id } = req.body;

  const checkBalance = "SELECT balance FROM users WHERE card_id = ?";

  db.query(checkBalance, [card_id], (err, result) => {

    if (err) return res.send(err);

    if (result.length === 0) {
      return res.send("Invalid Card");
    }

    const balance = result[0].balance;

    if (balance < 10) {
      return res.send("Insufficient Balance");
    }

    // Deduct ₹10
    const deductFare =
      "UPDATE users SET balance = balance - 10 WHERE card_id = ?";

    db.query(deductFare, [card_id], (err) => {
      if (err) return res.send(err);
    });

    // Start trip
    const startTrip =
      "INSERT INTO trips (card_id, start_time, entry_stop_id, status) VALUES (?, NOW(), ?, 'ACTIVE')";

    db.query(startTrip, [card_id, entry_stop_id], (err) => {

      if (err) return res.send(err);

      res.send("✅ Tap-IN successful (₹10 deducted)");

    });

  });

});

/* End trip */

app.post("/trip/end", (req, res) => {

  const { trip_id, exit_stop_id, card_id } = req.body;

  const getTrip =
    "SELECT entry_stop_id FROM trips WHERE trip_id = ?";

  db.query(getTrip, [trip_id], (err, tripResult) => {

    if (err) return res.send(err);

    if (!tripResult.length || !tripResult[0].entry_stop_id) {
      return res.send("❌ Invalid trip or missing entry stop");
    }

    const entry_stop_id = tripResult[0].entry_stop_id;

    const getStops =
      "SELECT id, stop_order FROM stops WHERE id IN (?, ?)";

    db.query(getStops, [entry_stop_id, exit_stop_id], (err, stopResult) => {

      if (err) return res.send(err);

      let entryOrder, exitOrder;

      stopResult.forEach(s => {
        if (s.id === entry_stop_id) entryOrder = s.stop_order;
        if (s.id === exit_stop_id) exitOrder = s.stop_order;
      });

      if (entryOrder === undefined || exitOrder === undefined) {
        return res.send("❌ Stop data missing");
      }

      const distance = Math.abs(exitOrder - entryOrder);

      if (isNaN(distance)) {
        return res.send("❌ Distance calculation error");
      }

      const getFare = "SELECT cost_per_km FROM fare_rules LIMIT 1";

      db.query(getFare, (err, fareResult) => {

        if (err) return res.send(err);

        const cost_per_km = fareResult[0].cost_per_km;

        const fare = distance * cost_per_km;

        if (isNaN(fare)) {
          return res.send("❌ Fare calculation error");
        }

        const deduct =
          "UPDATE users SET balance = balance - ? WHERE card_id = ?";

        db.query(deduct, [fare, card_id], (err) => {

          if (err) return res.send(err);

          const endTrip =
            "UPDATE trips SET exit_stop_id = ?, end_time = NOW(), status='COMPLETED' WHERE trip_id = ?";

          db.query(endTrip, [exit_stop_id, trip_id], (err) => {

            if (err) return res.send(err);

            res.send(`✅ Trip ended. Fare deducted: ₹${fare}`);

          });

        });

      });

    });

  });

});
/* ---------------- TRIP HISTORY ---------------- */

app.get("/trips/:card_id", (req, res) => {

  const card_id = req.params.card_id;

  const sql = "SELECT * FROM trip WHERE card_id = ?";

  db.query(sql, [card_id], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }

  });

});

/* ---------------- LOGIN API ---------------- */

app.post("/login", (req, res) => {

  const { card_id } = req.body;

  const sql = "SELECT * FROM users WHERE card_id = ?";

  db.query(sql, [card_id], (err, result) => {

    if (err) return res.send(err);

    if (result.length > 0) {
      res.json({
        success: true,
        message: "Login successful",
        user: result[0]
      });
    } else {
      res.json({
        success: false,
        message: "Invalid Card ID"
      });
    }

  });

});

/* ---------------- START SERVER ---------------- */

app.listen(3001, () => {

  console.log("🚀 Server running on port 3001");

});