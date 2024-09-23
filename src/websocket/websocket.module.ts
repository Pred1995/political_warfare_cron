import {Global, Module} from '@nestjs/common';
import { MyWebSocketGateway } from './websocket.gateway';
import {PrismaService} from "../prisma/prisma.service";

@Global()
@Module({
    providers: [MyWebSocketGateway, PrismaService],
    exports: [MyWebSocketGateway],
})
export class WebSocketModule {}
