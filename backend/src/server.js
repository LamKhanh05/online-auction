import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import passport from "passport";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import "./config/passport.js"; // Import passport config
import { connectDB } from "./lib/database.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import bidRoutes from "./routes/bid.js";
import auctionRoutes from "./routes/auction.js";
import ratingRoutes from "./routes/rating.js";
import userAuctionRoutes from "./routes/userAuction.js";
import userRoutes from "./routes/user.js";
import watchlistRoutes from "./routes/watchlist.js";
import categoryRoutes from "./routes/category.js";
import productRoutes from "./routes/product.js";
import questionRoutes from "./routes/question.js";
import orderRoutes from "./routes/order.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(compression());

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(",").map(url => url.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
  })
);

// Middeware: Body Parser & Cookie Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/auctions", auctionRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/user/auctions", userAuctionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/orders", orderRoutes);
// Admin routes
app.use("/api/admin", adminRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler (PHẢI CÓ CUỐI CÙNG)
app.use(errorHandler);

// Global Exception Handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err.name, err.message, err.stack);
  // process.exit(1); // Don't exit in dev for now
});

// Start Server
async function startServer() {
  await connectDB();

  // Start Scheduler
  const { startScheduler } = await import("./scheduler.js");
  startScheduler();

  app.listen(PORT, () => {
    console.log(`Local host: http://localhost:${PORT}`);
  });
}

startServer();

// Server modified to trigger reload (v2)
