import { WebSocket } from "ws";
import type { WSEvent } from "./events";

interface ConnectionInfo {
  ws: WebSocket;
  userId: number;
  role: "instructor" | "student";
}

/**
 * Manages WebSocket connections organized by class
 */
class ConnectionManager {
  // Map of classId -> Set of connections
  private classConnections: Map<number, Set<ConnectionInfo>> = new Map();

  // Map of WebSocket -> connection info (for cleanup)
  private wsToInfo: Map<WebSocket, { classId: number; info: ConnectionInfo }> =
    new Map();

  /**
   * Subscribe a connection to a class channel
   */
  subscribe(
    classId: number,
    ws: WebSocket,
    userId: number,
    role: "instructor" | "student"
  ): void {
    const info: ConnectionInfo = { ws, userId, role };

    // Get or create the set for this class
    let connections = this.classConnections.get(classId);
    if (!connections) {
      connections = new Set();
      this.classConnections.set(classId, connections);
    }

    connections.add(info);
    this.wsToInfo.set(ws, { classId, info });

    console.log(
      `WebSocket: User ${userId} (${role}) subscribed to class ${classId}`
    );
  }

  /**
   * Unsubscribe a connection from its class channel
   */
  unsubscribe(ws: WebSocket): void {
    const mapping = this.wsToInfo.get(ws);
    if (!mapping) return;

    const { classId, info } = mapping;
    const connections = this.classConnections.get(classId);

    if (connections) {
      connections.delete(info);

      // Clean up empty sets
      if (connections.size === 0) {
        this.classConnections.delete(classId);
      }
    }

    this.wsToInfo.delete(ws);
    console.log(
      `WebSocket: User ${info.userId} unsubscribed from class ${classId}`
    );
  }

  /**
   * Broadcast an event to all connections in a class
   */
  broadcast(classId: number, event: WSEvent): void {
    const connections = this.classConnections.get(classId);
    if (!connections || connections.size === 0) {
      return;
    }

    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const conn of connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
        sentCount++;
      }
    }

    console.log(
      `WebSocket: Broadcast ${event.type} to ${sentCount} connections in class ${classId}`
    );
  }

  /**
   * Send an event to a specific user in a class
   */
  sendToUser(classId: number, userId: number, event: WSEvent): void {
    const connections = this.classConnections.get(classId);
    if (!connections) return;

    const message = JSON.stringify(event);

    for (const conn of connections) {
      if (conn.userId === userId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  /**
   * Send an event to the instructor(s) of a class
   */
  sendToInstructor(classId: number, event: WSEvent): void {
    const connections = this.classConnections.get(classId);
    if (!connections) return;

    const message = JSON.stringify(event);

    for (const conn of connections) {
      if (conn.role === "instructor" && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    }
  }

  /**
   * Get connection stats for debugging
   */
  getStats(): { totalClasses: number; totalConnections: number } {
    let totalConnections = 0;
    for (const connections of this.classConnections.values()) {
      totalConnections += connections.size;
    }
    return {
      totalClasses: this.classConnections.size,
      totalConnections,
    };
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
