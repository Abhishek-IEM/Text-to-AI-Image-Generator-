import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import userRouter from "./routes/userRoutes.js";
import imageRouter from "./routes/imageRoutes.js";

const port = process.env.PORT || 4000;
const app = express();

// ✅ Allowed origins
const allowedOrigins = [
  "http://localhost:5173",                  
  "http://127.0.0.1:5173",                   
  "https://text-to-ai-image-generator.onrender.com" 
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));


app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect DB
await connectDB();

// Routes
app.use("/api/user", userRouter);
app.use("/api/image", imageRouter);


app.get("/api/test", (req, res) => {
  res.json({ success: true, message: "CORS is working!" });
});

// Root route
app.get("/", (req, res) => {
  res.send("API Working");
});

app.listen(port, () => console.log(`Server started on PORT: ${port}`));
