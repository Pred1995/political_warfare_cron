import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class MyWebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket) {
        const userId = client.handshake.query.userId as string;

        if (userId) {
            client.join(userId);
        }
    }

    handleDisconnect(client: Socket) {
        client.leave(client.id);
    }

}
