
import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true as const,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // Fall back to public directory if client directory doesn't exist
      let template;
      try {
        // always reload the index.html file from disk incase it changes
        template = await fs.promises.readFile(clientTemplate, "utf-8");
      } catch (err) {
        console.log(`Could not find template at ${clientTemplate}, trying alternatives...`);
        const alternatives = [
          path.resolve(process.cwd(), "client", "index.html"),
          path.resolve(process.cwd(), "dist", "client", "index.html"),
          path.resolve(process.cwd(), "dist", "public", "index.html")
        ];
        
        for (const alt of alternatives) {
          try {
            if (fs.existsSync(alt)) {
              template = await fs.promises.readFile(alt, "utf-8");
              console.log(`Found template at ${alt}`);
              break;
            }
          } catch (e) {
            // continue to next alternative
          }
        }
        
        if (!template) {
          throw new Error(`Could not find any valid template file`);
        }
      }
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Serve static files from the client directory
  const clientDir = path.resolve(process.cwd(), 'dist/public');
  console.log(`Serving static files from ${clientDir}`);
  app.use(express.static(clientDir));

  // Catch-all route to serve index.html for client-side routing
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    const indexPath = path.join(clientDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.warn(`Could not find index.html in ${clientDir}`);
      res.status(404).send("Page not found. Make sure the build process created the expected files.");
    }
  });
}
