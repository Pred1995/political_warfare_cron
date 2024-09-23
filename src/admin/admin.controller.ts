import {Controller, Get, Patch, Param, Query, Body} from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sort') sort: string = 'created_at',
    @Query('order') order: 'asc' | 'desc' = 'asc',
    @Query('filter') filter: string = ''
  ) {
    return this.adminService.getUsers(page, limit, sort, order, filter);
  }

  @Patch('users/:id/ban')
  async banUser(@Param('id') userId: number, @Body() body: { banned: boolean }) {
    return this.adminService.banUser(Number(userId), body.banned);
  }
}
