import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger.js';

class SocketService {
  private io: SocketIOServer | null = null;

  public init(httpServer: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket client connected: ${socket.id}`);

      // Client joins an event room to receive live seat updates
      socket.on('join_event', (eventId: string) => {
        if (eventId) {
          const room = `event:${eventId}`;
          socket.join(room);
          logger.debug(`Socket ${socket.id} joined room ${room}`);
        }
      });

      // Client leaves an event room
      socket.on('leave_event', (eventId: string) => {
        if (eventId) {
          const room = `event:${eventId}`;
          socket.leave(room);
          logger.debug(`Socket ${socket.id} left room ${room}`);
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Socket client disconnected: ${socket.id}`);
      });
    });

    return this.io;
  }

  public getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.io has not been initialized.');
    }
    return this.io;
  }

  /**
   * Emit an event to all clients in a specific room
   */
  public emitToRoom(room: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(room).emit(event, data);
      logger.debug(`Emitted [${event}] to room [${room}]`, data);
    }
  }

  /**
   * Broadcast seat status change to event room
   */
  public broadcastSeatUpdate(
    eventId: string,
    eventType: 'SEATS_HELD' | 'SEATS_RELEASED' | 'SEATS_BOOKED' | 'WAITLIST_OFFER_CREATED' | 'WAITLIST_OFFER_EXPIRED',
    payload: any
  ): void {
    this.emitToRoom(`event:${eventId}`, eventType, {
      eventId,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}

export const socketService = new SocketService();
