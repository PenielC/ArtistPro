import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: Number(
            configService.get<string>('JWT_ACCESS_EXPIRY_SECONDS') ?? 900,
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController, OrganizationController],
  providers: [AuthService, OrganizationService, JwtStrategy, RolesGuard],
  exports: [AuthService],
})
export class AuthModule {}
