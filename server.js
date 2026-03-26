console.log("Server file started");

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('bus'));

/* ---------------- DATABASE CONNECTION ---------------- */

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Fida@2247",
  database: "smart_bus_system"   // ✅ FIXED
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

/* ---------------- REGISTER ---------------- */

app.post("/register", (req, res) => {
  const { username, password, email, phone } = req.body;

  if (!username || !password || !email || !phone) {
    return res.status(400).json({ success: false });
  }

  const check = "SELECT * FROM users WHERE username=? OR email=?";
  db.query(check, [username, email], (err, result) => {

    if (result.length > 0) {
      return res.json({ success: false, message: "User exists" });
    }

    const getMax = "SELECT MAX(card_id) AS maxId FROM users";
    db.query(getMax, (err, data) => {

      const newId = (data[0].maxId || 100) + 1;

      const insert =
        "INSERT INTO users (card_id, username, password, email, phone, balance) VALUES (?, ?, ?, ?, ?, 0)";

      db.query(insert, [newId, username, password, email, phone], (err) => {
        if (err) return res.send(err);

        res.json({ success: true });
      });

    });
  });
});

/* ---------------- LOGIN ---------------- */

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const sql = "SELECT * FROM users WHERE username=? AND password=?";
  db.query(sql, [username, password], (err, result) => {

    if (result.length > 0) {
      res.json({
        success: true,
        card_id: result[0].card_id,   // ✅ IMPORTANT
        username: result[0].username
      });
    } else {
      res.json({ success: false });
    }
  });
});

/* ---------------- BALANCE ---------------- */

app.get("/balance/:card_id", (req, res) => {

  db.query(
    "SELECT balance FROM users WHERE card_id=?",
    [req.params.card_id],
    (err, result) => {
      res.json(result[0]);
    }
  );

});

/* ---------------- RECHARGE ---------------- */

app.post("/recharge", (req, res) => {

  const { card_id, amount } = req.body;

  db.query(
    "UPDATE users SET balance = balance + ? WHERE card_id=?",
    [amount, card_id],
    (err) => {

      // ✅ store transaction
      db.query(
        "INSERT INTO transactions (card_id, amount, txn_type, txn_time) VALUES (?, ?, 'RECHARGE', NOW())",
        [card_id, amount]
      );

      res.send("Recharged");
    }
  );
});

/* ---------------- STOPS ---------------- */

app.get("/stops", (req, res) => {

  db.query("SELECT * FROM stops ORDER BY stop_order", (err, result) => {
    res.json(result);
  });

});

/* ---------------- START TRIP ---------------- */

app.post("/trip/start", (req, res) => {

  const { card_id, entry_stop_id } = req.body;

  db.query("SELECT balance FROM users WHERE card_id=?", [card_id], (err, result) => {

    if (result[0].balance < 10) {
      return res.send("Insufficient balance");
    }

    // deduct base fare
    db.query("UPDATE users SET balance = balance - 10 WHERE card_id=?", [card_id]);

    // save transaction
    db.query(
      "INSERT INTO transactions (card_id, amount, txn_type, txn_time) VALUES (?, 10, 'BASE_FARE', NOW())",
      [card_id]
    );

    // create trip
    db.query(
      "INSERT INTO trips (card_id, entry_stop_id, start_time, status) VALUES (?, ?, NOW(), 'ACTIVE')",
      [card_id, entry_stop_id]
    );

    res.send("Trip started");
  });

});

/* ---------------- END TRIP ---------------- */

app.post("/trip/end", (req, res) => {

  const { trip_id, exit_stop_id, card_id } = req.body;

  db.query(
    "SELECT entry_stop_id FROM trips WHERE trip_id=?",
    [trip_id],
    (err, trip) => {

      const entry = trip[0].entry_stop_id;

      db.query(
        "SELECT id, stop_order FROM stops WHERE id IN (?, ?)",
        [entry, exit_stop_id],
        (err, stops) => {

          let e, x;

          stops.forEach(s => {
            if (s.id == entry) e = s.stop_order;
            if (s.id == exit_stop_id) x = s.stop_order;
          });

          const distance = Math.abs(x - e);

          db.query("SELECT cost_per_km FROM fare_rules LIMIT 1", (err, fareData) => {

            const fare = distance * fareData[0].cost_per_km;

            // deduct
            db.query(
              "UPDATE users SET balance = balance - ? WHERE card_id=?",
              [fare, card_id]
            );

            // save transaction
            db.query(
              "INSERT INTO transactions (card_id, amount, txn_type, txn_time) VALUES (?, ?, 'DISTANCE_FARE', NOW())",
              [card_id, fare]
            );

            // complete trip
            db.query(
              "UPDATE trips SET exit_stop_id=?, end_time=NOW(), status='COMPLETED' WHERE trip_id=?",
              [exit_stop_id, trip_id]
            );

            res.send(`Trip ended. Fare ₹${fare}`);
          });

        }
      );
    }
  );
});

/* ---------------- TRIPS ---------------- */

app.get("/trips/:card_id", (req, res) => {

  db.query(
    "SELECT * FROM trips WHERE card_id=?",
    [req.params.card_id],
    (err, result) => {
      res.json(result);
    }
  );

});

/* ---------------- TRANSACTIONS ---------------- */

app.get("/transactions/:card_id", (req, res) => {

  db.query(
    "SELECT * FROM transactions WHERE card_id=? ORDER BY txn_time DESC",
    [req.params.card_id],
    (err, result) => {
      res.json(result);
    }
  );

});

/* ---------------- DASHBOARD ---------------- */

app.get("/dashboard/:card_id", (req, res) => {

  db.query(
    "SELECT card_id, name, balance FROM users WHERE card_id=?",
    [req.params.card_id],
    (err, result) => {
      res.json(result[0]);
    }
  );

});

/* ---------------- PROFILE ---------------- */

app.put("/profile/:card_id", (req, res) => {

  const { name, email, phone } = req.body;

  db.query(
    "UPDATE users SET name=?, email=?, phone=? WHERE card_id=?",
    [name, email, phone, req.params.card_id],
    () => {
      res.send("Profile updated");
    }
  );

});

/* ---------------- CHANGE PASSWORD ---------------- */

app.post("/change-password", (req, res) => {

  const { card_id, oldPassword, newPassword } = req.body;

  db.query(
    "SELECT * FROM users WHERE card_id=? AND password=?",
    [card_id, oldPassword],
    (err, result) => {

      if (result.length === 0) {
        return res.send("Wrong password");
      }

      db.query(
        "UPDATE users SET password=? WHERE card_id=?",
        [newPassword, card_id],
        () => {
          res.send("Password changed");
        }
      );
    }
  );

});

/* ---------------- ADMIN ---------------- */

app.get("/admin/users", (req, res) => {
  db.query("SELECT * FROM users", (err, result) => {
    res.json(result);
  });
});

app.get("/admin/trips", (req, res) => {
  db.query("SELECT * FROM trips", (err, result) => {
    res.json(result);
  });
});

app.get("/admin/revenue", (req, res) => {
  db.query("SELECT SUM(amount) AS total FROM transactions", (err, result) => {
    res.json(result[0]);
  });
});

/* email */
const nodemailer = require("nodemailer");

app.post("/send-ticket-email", async (req, res) => {
  const { email, message } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "faihafathimavk@gmail.com",        // 👈 your email
        pass: "lorzhzpppnlcbadn"           // 👈 NOT normal password
      }
    });

    await transporter.sendMail({
      from: "faihafathimavk@gmail.com",
      to: email,
      subject: "Your Bus Ticket 🎟️",
      text: message
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});
/* ---------------- START SERVER ---------------- */

app.listen(3001, () => {
  console.log("🚀 Server running on port 3001");
});
