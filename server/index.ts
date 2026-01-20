import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { registerRouteModules } from "./routes/index";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocket } from "./websocket";
import { getSessionConfig, setupAuth } from "./auth";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { AppError, ValidationError } from "./errors";

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
app.use("/api/register", authLimiter);
app.use("/api/password-reset", authLimiter);

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

  // Register modular routes first (classes, assignments, etc.)
  registerRouteModules(app);

  // Register remaining routes from monolithic routes.ts
  const server = await registerRoutes(app);

  // Set up WebSocket for real-time updates
  try {
    const { sessionStore, sessionSecret } = getSessionConfig();
    setupWebSocket(server, sessionStore, sessionSecret);
    log("WebSocket server initialized");
  } catch (error) {
    console.error("Failed to initialize WebSocket:", error);
  }

  // Centralized error handling middleware
  app.use((err: Error | AppError, _req: Request, res: Response, _next: NextFunction) => {
    // Log error details (always log for debugging)
    console.error("Error:", {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      ...(err instanceof AppError && { statusCode: err.statusCode, isOperational: err.isOperational }),
    });

    // Handle known operational errors (AppError instances)
    if (err instanceof AppError) {
      const response: Record<string, unknown> = { message: err.message };

      // Include validation errors if present
      if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
        response.errors = err.errors;
      }

      // Include stack trace in development
      if (process.env.NODE_ENV === "development") {
        response.stack = err.stack;
      }

      return res.status(err.statusCode).json(response);
    }

    // Handle unknown errors (programming errors, etc.)
    const statusCode = 500;
    const message = process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

    res.status(statusCode).json({
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  });

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
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
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