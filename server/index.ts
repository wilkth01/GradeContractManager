import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { registerRouteModules } from "./routes/index";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocket } from "./websocket";
import { getSessionConfig, setupAuth } from "./auth";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { errorHandler } from "./middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith("/api"), // Only limit API routes
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login attempts per windowMs
  message: { message: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters
app.use(apiLimiter);
app.use("/api/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/invitations", authLimiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

(async () => {
  // Set up authentication (must be before any routes that use requireAuth)
  setupAuth(app);

  // Register the API route modules (see server/routes/index.ts)
  registerRouteModules(app);

  const server = createServer(app);

  // Set up WebSocket for real-time updates
  try {
    const { sessionStore, sessionSecret } = getSessionConfig();
    setupWebSocket(server, sessionStore, sessionSecret);
    log("WebSocket server initialized");
  } catch (error) {
    console.error("Failed to initialize WebSocket:", error);
  }

  // Anything under /api that reached here matched no route. Without this the
  // SPA catch-all below answers with index.html and a 200, so a client calling
  // a removed or mistyped endpoint gets HTML to parse as JSON rather than a
  // clean 404.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use PORT from environment (Render provides this) or default to 5000
  const port = parseInt(process.env.PORT || "5000", 10);
  console.log(`Starting server from ${__dirname}`);
  console.log(`Current working directory: ${process.cwd()}`);
  
  // Log uncaught errors
  // After an uncaught exception the process is in an undefined state. Logging
  // and carrying on is worse than stopping: a half-broken server still holding
  // the port keeps a supervisor from restarting it, and hides the failure. This
  // was not academic -- a failed bind previously left the process "running"
  // while serving nothing.
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process and try again.`);
    } else {
      console.error('Server error:', error);
    }
    process.exit(1);
  });

  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`Server listening on port ${port}`);
    log(`Environment: ${process.env.NODE_ENV}`);
  });
})();