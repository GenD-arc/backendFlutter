// websocket-server.js
const WebSocket = require('ws');
const connection = require('./controllers/database');

class NotificationWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();
    
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, request) => {
      
      // Extract user ID from query string (e.g., ws://localhost:4000?userId=ADM-002)
      const url = new URL(request.url, `http://${request.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      if (userId) {
        this.clients.set(userId, ws);
      }

      ws.on('message', (message) => {
      });

      ws.on('close', () => {
        // Remove client on disconnect
        for (const [id, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(id);
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
      return true;
    } else {
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
  }

  // Get connected users count
  getConnectedUsers() {
    return this.clients.size;
  }
}

module.exports = NotificationWebSocketServer;