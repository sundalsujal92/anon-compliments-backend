require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);

// ---- ENV VARIABLES ----
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---- SUPABASE SERVER CLIENT (keep this only on backend!) ----
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- MIDDLEWARE ----
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ---- SOCKET.IO ----
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// When a user connects to Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  // Frontend will emit 'join_room' with their recipientCode
  socket.on("join_room", (recipientCode) => {
    console.log(`socket ${socket.id} joined room: ${recipientCode}`);
    socket.join(recipientCode);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ---- ROUTES ----

// Simple health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running 🚀" });
});

// Generate a new recipient code (e.g. for the girl you want to impress 😏)
app.post("/api/recipient", async (req, res) => {
  try {
    const code = generateRecipientCode();
    // You can store this in Supabase if you want, but for now we just return it
    return res.json({ recipientCode: code });
  } catch (err) {
    console.error("Error generating recipient code:", err);
    res.status(500).json({ error: "Failed to generate recipient code" });
  }
});

// Send a compliment (anonymous)
app.post("/api/compliments", async (req, res) => {
  try {
    const { recipientCode, message } = req.body;

    if (!recipientCode || !message) {
      return res
        .status(400)
        .json({ error: "recipientCode and message are required" });
    }

    // Save in Supabase
    const { data, error } = await supabase
      .from("compliments")
      .insert([
        {
          recipient_code: recipientCode,
          message,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Failed to save compliment" });
    }

    // Emit real-time event to that recipient's room
    io.to(recipientCode).emit("new_compliment", data);

    res.status(201).json({ success: true, compliment: data });
  } catch (err) {
    console.error("Error in /api/compliments:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all compliments for a recipient (when they open the page)
app.get("/api/compliments/:recipientCode", async (req, res) => {
  const { recipientCode } = req.params;

  try {
    const { data, error } = await supabase
      .from("compliments")
      .select("*")
      .eq("recipient_code", recipientCode)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ error: "Failed to fetch compliments" });
    }

    res.json({ compliments: data });
  } catch (err) {
    console.error("Error fetching compliments:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---- HELPER: Generate short random recipient code ----
function generateRecipientCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ---- START SERVER ----
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
