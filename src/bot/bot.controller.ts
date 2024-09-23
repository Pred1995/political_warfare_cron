import { Controller, Get, Query } from "@nestjs/common";
import { BotService } from "./bot.service";

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('invite-link')
  async getInviteLink() {
    const inviteLink = await this.botService.createGroupInviteLink();
    return { inviteLink: inviteLink.invite_link };
  }

  @Get('check-group-membership')
  async checkGroupMembership(
    @Query('userId') userId: number,
    @Query('chatId') chatId: string
  ) {

    const result = await this.botService.checkUserInGroup(userId, chatId);
    return { message: result[0], confirmed: result[1] };
  }

  @Get('check-chat-membership')
  async checkChatMembership(
    @Query('userId') userId: number,
    @Query('chatId') chatId: string
  ) {

    const result = await this.botService.checkUserInChat(Number(userId), chatId);
    return { message: result[0], confirmed: result[1] };
  }
}
