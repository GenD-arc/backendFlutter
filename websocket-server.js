// websocket-server.js
const WebSocket = require('ws');
const connection = require('./controllers/database');

class NotificationWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // userId -> WebSocket
    
    this.setupWebSocket();
    console.log('🔔 WebSocket Notification Server Started');
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, request) => {
      console.log('🔔 New WebSocket connection');
      
      // Extract user ID from query string (e.g., ws://localhost:4000?userId=ADM-002)
      const url = new URL(request.url, `http://${request.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      if (userId) {
        this.clients.set(userId, ws);
        console.log(`🔔 User ${userId} connected to WebSocket`);
      }

      ws.on('message', (message) => {
        console.log('🔔 Received:', message.toString());
        // Handle incoming messages if needed
      });

      ws.on('close', () => {
        // Remove client on disconnect
        for (const [id, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(id);
            console.log(`🔔 User ${id} disconnected from WebSocket`);
            break;
          }
        }
      });

      ws.on('error', (error) => {
        console.error('🔔 WebSocket error:', error);
      });
    });
  }

  // Send notification to specific user
  sendToUser(userId, notification) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(notification));
      console.log(`🔔 Sent real-time notification to ${userId}:`, notification.type);
      return true;
    } else {
      console.log(`🔔 User ${userId} not connected to WebSocket`);
      return false;
    }
  }

  // Broadcast to all connected clients
  broadcast(notification) {
    this.clients.forEach((client, userId) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(notification));
      }
    });
    console.log(`🔔 Broadcasted notification to ${this.clients.size} clients`);
  }

  // Get connected users count
  getConnectedUsers() {
    return this.clients.size;
  }
}

module.exports = NotificationWebSocketServer;