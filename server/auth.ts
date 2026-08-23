import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Export session configuration for WebSocket authentication
export function getSessionConfig() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return {
    sessionStore: storage.sessionStore,
    sessionSecret: process.env.SESSION_SECRET,
  };
}

/**
 * Strip stored secrets before a user object crosses the wire.
 *
 * req.user carries the scrypt password hash and the encrypted Canvas token.
 * Neither has any business reaching a browser: returning the hash is what the
 * login and session endpoints used to do, and the Canvas token is a
 * full-access credential for the instructor's Canvas account.
 */
export function toPublicUser(user: SelectUser) {
  const { password: _password, canvasTokenEncrypted: _token, ...publicUser } = user;
  return publicUser;
}

export function setupAuth(app: Express) {
  const { sessionStore, sessionSecret } = getSessionConfig();
  const isProduction = process.env.NODE_ENV === "production";

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: isProduction, // HTTPS only in production
      httpOnly: true,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !user.password || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  // Public self-registration is deliberately absent.
  //
  // It previously spread req.body straight into createUser with no validation
  // and offered an instructor role in the signup form, so anyone with the URL
  // could mint an instructor account. Students now arrive only by redeeming an
  // invitation (POST /api/invitations/:token/setup); instructor accounts are
  // provisioned out of band.

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ 
          message: "Invalid username or password. Please check your credentials and try again." 
        });
      }
      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.json(toPublicUser(user));
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(toPublicUser(req.user));
  });
}