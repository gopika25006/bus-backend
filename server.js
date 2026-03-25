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


/* ---------------- REGISTER API ---------------- */

app.post("/register", (req, res) => {

  const { username, password, email, phone } = req.body;

  if (!username || !password || !email || !phone) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }

  // check if user already exists
  const checkUser = "SELECT * FROM users WHERE username = ? OR email = ?";

  db.query(checkUser, [username, email], (err, result) => {

    if (err) return res.status(500).send(err);

    if (result.length > 0) {
      return res.json({
        success: false,
        message: "User already exists"
      });
    }

    // generate new card_id (simple method)
    const getMaxId = "SELECT MAX(card_id) AS maxId FROM users";

    db.query(getMaxId, (err, data) => {

      const newId = (data[0].maxId || 100) + 1;

      const insertUser =
        "INSERT INTO users (card_id, username, password, email, phone, balance) VALUES (?, ?, ?, ?, ?, 0)";

      db.query(insertUser, [newId, username, password, email, phone], (err) => {

        if (err) return res.status(500).send(err);

        res.json({
          success: true,
          message: "Registration successful"
        });

      });

    });

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

  const sql = "SELECT balance FROM users WHERE card_id = ?";

  db.query(sql, [card_id], (err, result) => {

    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }

  });

});
app.post("/recharge", (req, res) => {

  const { card_id, amount } = req.body;

  const sql =
    "UPDATE users SET balance = balance + ? WHERE card_id = ?";

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

    if (err) return res.status(500).send(err);

    if (result.length === 0) {
      return res.status(404).send("Invalid Card ID");
    }

    const balance = result[0].balance;

    if (balance < 10) {
      return res.status(400).send("Insufficient Balance");
    }

    // Deduct ₹10
    const deductFare =
      "UPDATE users SET balance = balance - 10 WHERE card_id = ?"

    db.query(deductFare, [card_id], (err) => {
      if (err) return res.status(500).send(err);

      // Start trip
      const startTrip =
        "INSERT INTO trips (card_id, start_time, entry_stop_id, status, bus_id) VALUES (?, NOW(), ?, 'ACTIVE', ?)";

      db.query(startTrip, [card_id, entry_stop_id, bus_id], (err) => {
        if (err) return res.status(500).send(err);

        res.send("✅ Tap-IN successful (₹10 deducted)");
      });
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

        if (!fareResult.length) {
          return res.status(500).send("❌ Fare rules not configured");
        }

        const cost_per_km = fareResult[0].cost_per_km;

        const fare = distance * cost_per_km;

        if (isNaN(fare)) {
          return res.status(500).send("❌ Fare calculation error");
        }

        const deduct =
          "UPDATE users SET balance = balance - ? WHERE card_id = ?"

        db.query(deduct, [fare, card_id], (err) => {

          if (err) return res.status(500).send(err);

          const endTrip =
            "UPDATE trips SET exit_stop_id = ?, end_time = NOW(), status='COMPLETED' WHERE trip_id = ?";

          db.query(endTrip, [exit_stop_id, trip_id], (err) => {

            if (err) return res.status(500).send(err);

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

  const sql = "SELECT * FROM trips WHERE card_id = ?";

  db.query(sql, [card_id], (err, result) => {

    if (err) {
      res.status(500).send(err);
    } else {
      res.json(result);
    }

  });

});

/* ---------------- LOGIN API ---------------- */

app.post("/login", (req, res) => {

  const { username, password } = req.body;

  const sql =
    "SELECT * FROM users WHERE username = ? AND password = ?";

  db.query(sql, [username, password], (err, result) => {

    if (err) return res.send(err);

    if (result.length > 0) {
      res.json({
        success: true,
        message: "Login successful"
      });
    } else {
      res.json({
        success: false,
        message: "Invalid username or password"
      });
    }

  });

});

/* ---------------- FORGOT PASSWORD API ---------------- */

app.post("/forgot-password", (req, res) => {

  const { value } = req.body; // email or phone

  if (!value) {
    return res.status(400).json({
      success: false,
      message: "Email or phone is required"
    });
  }

  const sql = "SELECT * FROM users WHERE email = ? OR phone = ?";

  db.query(sql, [value, value], (err, result) => {

    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (result.length === 0) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    // ✅ BETTER PRACTICE (no password exposure)
    res.json({
      success: true,
      message: "Reset link sent (demo)"
    });

  });

});
/* ---------------- START SERVER ---------------- */

app.listen(3001, () => {

  console.log("🚀 Server running on port 3001");

});

