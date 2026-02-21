import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:3000" },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Client → Server events ───────────────────────────────────────────────

  /** Frontend emits this on page load so the client gets zone-specific updates */
  @SubscribeMessage("join:zone")
  handleJoinZone(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { zone_id: string },
  ) {
    client.join(`zone:${data.zone_id}`);
    this.logger.log(`${client.id} joined zone:${data.zone_id}`);
  }

  /** Frontend emits this after login so user gets personal notifications */
  @SubscribeMessage("join:user")
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { user_id: string },
  ) {
    client.join(`user:${data.user_id}`);
    this.logger.log(`${client.id} joined user:${data.user_id}`);
  }

  // ── Server → Client emitters (called from services) ──────────────────────

  /** Broadcast to everyone in a zone when a new listing is created */
  emitNewListing(zoneId: string, payload: any) {
    this.server.to(`zone:${zoneId}`).emit("listing:new", payload);
  }

  /** Notify a specific seller that AI matched buyers to their listing */
  emitMatchFound(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit("match:found", payload);
  }

  /** Notify both seller and collector that a pickup was confirmed */
  emitCollectionConfirmed(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit("collection:confirmed", payload);
  }
}
