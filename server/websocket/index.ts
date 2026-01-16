import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { connectionManager } from "./connections";
import { parse as parseCookie } from "cookie";

// Re-export for convenience
export { connectionManager } from "./connections";
export * from "./events";

interface SubscribeMessage {
  type: "subscribe";
  classId: number;
}

interface UnsubscribeMessage {
  type: "unsubscribe";
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;

/**
 * Set up WebSocket server for real-time updates
 */
export function setupWebSocket(
  server: Server,
  sessionStore: any,
  sessionSecret: string
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    console.log("WebSocket: New connection attempt");

    // Parse session from cookie
    const cookies = parseCookie(req.headers.cookie || "");
    const sessionId = cookies["connect.sid"];

    if (!sessionId) {
      console.log("WebSocket: No session cookie, closing connection");
      ws.close(4001, "Unauthorized");
      return;
    }

    // Extract the session ID (format: s:sessionid.signature)
    const sidMatch = sessionId.match(/^s:([^.]+)\./);
    const sid = sidMatch ? sidMatch[1] : sessionId;

    // Get session from store
    sessionStore.get(sid, (err: Error | null, session: any) => {
      if (err || !session || !session.passport?.user) {
        console.log("WebSocket: Invalid or expired session, closing connection");
        ws.close(4001, "Unauthorized");
        return;
      }

      const userId = session.passport.user;

      // We'll get the user role when they subscribe to a class
      // For now, just log the connection
      console.log(`WebSocket: Authenticated user ${userId}`);

      // Store user info on the WebSocket for later use
      (ws as any).userId = userId;

      // Handle messages from client
      ws.on("message", async (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());

          if (message.type === "subscribe" && message.classId) {
            // Get user role from database
            const { storage } = await import("../storage");
            const user = await storage.getUser(userId);

            if (!user) {
              ws.send(
                JSON.stringify({ type: "error", message: "User not found" })
              );
              return;
            }

            // Verify user has access to this class
            const cls = await storage.getClass(message.classId);
            if (!cls) {
              ws.send(
                JSON.stringify({ type: "error", message: "Class not found" })
              );
              return;
            }

            if (user.role === "instructor") {
              if (cls.instructorId !== userId) {
                ws.send(
                  JSON.stringify({ type: "error", message: "Access denied" })
                );
                return;
              }
            } else {
              // Check if student is enrolled
              const contract = await storage.getStudentContract(
                userId,
                message.classId
              );
              if (!contract) {
                ws.send(
                  JSON.stringify({ type: "error", message: "Not enrolled" })
                );
                return;
              }
            }

            // Subscribe to class
            connectionManager.subscribe(
              message.classId,
              ws,
              userId,
              user.role as "instructor" | "student"
            );

            ws.send(
              JSON.stringify({
                type: "subscribed",
                classId: message.classId,
              })
            );
          } else if (message.type === "unsubscribe") {
            connectionManager.unsubscribe(ws);
            ws.send(JSON.stringify({ type: "unsubscribed" }));
          }
        } catch (error) {
          console.error("WebSocket: Error handling message", error);
          ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
        }
      });

      // Handle disconnection
      ws.on("close", () => {
        connectionManager.unsubscribe(ws);
        console.log(`WebSocket: User ${userId} disconnected`);
      });

      // Handle errors
      ws.on("error", (error) => {
        console.error(`WebSocket: Error for user ${userId}`, error);
        connectionManager.unsubscribe(ws);
      });

      // Send connected confirmation
      ws.send(JSON.stringify({ type: "connected", userId }));
    });
  });

  console.log("WebSocket server initialized on /ws");
  return wss;
}
