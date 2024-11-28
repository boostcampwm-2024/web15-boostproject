import {
  Controller,
  Post,
  Delete,
  Get,
  UseGuards,
  Request,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WorkspaceService } from './workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageResponseDto } from './dtos/messageResponse.dto';
import { CreateWorkspaceDto } from './dtos/createWorkspace.dto';
import { CreateWorkspaceResponseDto } from './dtos/createWorkspaceResponse.dto';
import { GetUserWorkspacesResponseDto } from './dtos/getUserWorkspacesResponse.dto';
import { CreateWorkspaceInviteUrlDto } from './dtos/createWorkspaceInviteUrl.dto';

export enum WorkspaceResponseMessage {
  WORKSPACE_CREATED = '워크스페이스를 생성했습니다.',
  WORKSPACE_DELETED = '워크스페이스를 삭제했습니다.',
  WORKSPACES_RETURNED = '사용자가 참여하고 있는 모든 워크스페이스들을 가져왔습니다.',
  WORKSPACE_INVITED = '워크스페이스 게스트 초대 링크가 생성되었습니다.',
  WORKSPACE_JOINED = '워크스페이스에 게스트로 등록되었습니다.',
}

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @ApiResponse({
    type: CreateWorkspaceResponseDto,
  })
  @ApiOperation({ summary: '워크스페이스를 생성합니다.' })
  @ApiBody({
    description: 'post',
    type: CreateWorkspaceDto,
  })
  @Post('/')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async createWorkspace(
    @Request() req,
    @Body() createWorkspaceDto: CreateWorkspaceDto,
  ) {
    const userId = req.user.sub; // 인증된 사용자의 ID
    const newWorkspace = await this.workspaceService.createWorkspace(
      userId,
      createWorkspaceDto,
    );
    return {
      message: WorkspaceResponseMessage.WORKSPACE_CREATED,
      workspaceId: newWorkspace.snowflakeId,
    };
  }

  @ApiResponse({
    type: MessageResponseDto,
  })
  @ApiOperation({
    summary:
      '워크스페이스를 삭제하고 해당 워크스페이스의 권한 정보도 삭제합니다. (cascade delete)',
  })
  @Delete('/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteWorkspace(@Request() req, @Param('id') id: string) {
    const userId = req.user.sub; // 인증된 사용자의 ID
    await this.workspaceService.deleteWorkspace(userId, id);

    return {
      message: WorkspaceResponseMessage.WORKSPACE_DELETED,
    };
  }

  @ApiResponse({ type: GetUserWorkspacesResponseDto })
  @ApiOperation({
    summary: '사용자가 참여 중인 워크스페이스 목록을 가져옵니다.',
  })
  @UseGuards(JwtAuthGuard)
  @Get('/user')
  @HttpCode(HttpStatus.OK)
  async getUserWorkspaces(@Request() req) {
    const userId = req.user.sub; // 인증된 사용자의 ID
    const workspaces = await this.workspaceService.getUserWorkspaces(userId);
    return {
      message: WorkspaceResponseMessage.WORKSPACES_RETURNED,
      workspaces,
    };
  }

  @ApiResponse({
    type: CreateWorkspaceInviteUrlDto,
  })
  @ApiOperation({
    summary: '사용자가 워크스페이스의 초대 링크를 생성합니다.',
  })
  @Post('/:id/invite')
  @UseGuards(JwtAuthGuard) // 로그인 인증
  @HttpCode(HttpStatus.CREATED)
  async generateInviteLink(@Request() req, @Param('id') id: string) {
    // TODO: 나중에 guest말도 다른 역할 초대 링크로도 확장
    const userId = req.user.sub; // 인증된 사용자 ID
    const inviteUrl = await this.workspaceService.generateInviteUrl(userId, id);

    return {
      message: WorkspaceResponseMessage.WORKSPACE_INVITED,
      inviteUrl,
    };
  }

  @ApiResponse({
    type: MessageResponseDto,
  })
  @ApiOperation({
    summary: '워크스페이스초대 링크에 접속해 권한을 업데이트합니다.',
  })
  @Get('/join')
  @UseGuards(JwtAuthGuard) // 로그인 인증
  @HttpCode(HttpStatus.OK)
  async joinWorkspace(@Request() req, @Query('token') token: string) {
    const userId = req.user.sub; // 인증된 사용자 ID
    await this.workspaceService.processInviteToken(userId, token);

    return { message: WorkspaceResponseMessage.WORKSPACE_INVITED };
  }

  @ApiOperation({
    summary: '특정 워크스페이스에 대한 사용자의 권한을 확인합니다.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '사용자의 권한이 확인되었습니다.',
    schema: {
      example: {
        role: 'owner',
      },
    },
  })
  @Get('/check-role')
  @HttpCode(HttpStatus.OK)
  async checkUserRole(
    @Request() req,
    @Query('workspaceId') workspaceId: string,
  ): Promise<{ role: 'owner' | 'guest' }> {
    const userId = req.user.sub; // 현재 인증된 사용자의 ID

    const role = await this.workspaceService.getUserRoleInWorkspace(
      userId,
      workspaceId,
    );

    if (!role) {
      throw new ForbiddenException(
        '해당 워크스페이스에 접근할 권한이 없습니다.',
      );
    }

    return {
      workspaceId,
      role,
    };
  }
}
