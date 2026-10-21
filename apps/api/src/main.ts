import 'reflect-metadata';
import express from 'express';
import {
  RescueLifecycleController,
  RescueLifecycleService,
} from './community/lifecycle.js';
import { PetSafetyService } from './care/safety.js';
import { PetSafetyController } from './care/safety-controller.js';
import { SchedulingService } from './care/scheduling.js';
import { SchedulingController } from './care/scheduling-controller.js';
import { registerRequestSecurity } from './http-security.js';
import { BankController } from './finance/banks-controller.js';
import { BankService } from './finance/banks.js';
import { MediaController } from './media/controller.js';
import { MediaService } from './media/service.js';
import { CommunityController } from './community/controller.js';
import { CommunityService } from './community/service.js';
import { RescueController } from './community/rescue-controller.js';
import { RescueService } from './community/rescue.js';
import { RideController } from './services/rides-controller.js';
import { RideService } from './services/rides.js';
import { OperationsController } from './operations/controller.js';
import { OperationsService } from './operations/service.js';
import { ServicesController } from './services/controller.js';
import { ServicesService } from './services/service.js';
import { CarePlansService } from './services/plans.js';
import { CommerceController } from './commerce/controller.js';
import { CommerceService } from './commerce/service.js';
import { CatalogService } from './commerce/catalog.js';
import { CatalogController } from './commerce/catalog-controller.js';
import { InventoryService } from './commerce/inventory.js';
import { InventoryController } from './commerce/inventory-controller.js';
import { DeliveryService } from './commerce/delivery.js';
import { DeliveryController } from './commerce/delivery-controller.js';
import { CommercePricingService } from './commerce/pricing.js';
import { CommercePricingController } from './commerce/pricing-controller.js';
import { GroomingService } from './services/grooming.js';
import { GroomingController } from './services/grooming-controller.js';
import { CareLibrary } from './care/library.js';
import { CareLibraryController } from './care/library-controller.js';
import { SocialDiscovery } from './community/discovery.js';
import { SocialDiscoveryController } from './community/discovery-controller.js';
import { FinancialReports } from './finance/reports.js';
import { FinancialReportsController } from './finance/reports-controller.js';
import { FinanceService } from './finance/ledger.js';
import { CareController } from './care/controller.js';
import { CareService } from './care/service.js';
import { registerIdentity } from './identity/bridge.js';
import { IdentityController } from './organizations/controller.js';
import { OrganizationService } from './organizations/service.js';
import {
  Controller,
  Get,
  Module,
  NotFoundException,
  ServiceUnavailableException,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  SwaggerModule,
  DocumentBuilder,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import {
  customerDemo,
  financeDemo,
} from '../../../packages/contracts/src/fixtures.js';

@ApiTags('التشغيل')
@Controller('api/v1')
class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'حالة العملية، لا تعني جاهزية قاعدة البيانات' })
  health() {
    return {
      status: 'ok',
      service: 'petra-api',
      phase: 'care-plan-lifecycle-local',
      demoEnabled: process.env.PETRA_DEMO_MODE === 'true',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'فحص اتصال PostgreSQL وRedis' })
  async ready() {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
      throw new ServiceUnavailableException('إعداد الخدمات المحلية غير مكتمل');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      max: 1,
    });
    const redis = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    redis.on('error', () => undefined);
    try {
      await pool.query('SELECT 1');
      await redis.connect();
      if ((await redis.ping()) !== 'PONG') throw new Error('redis unavailable');
      return { status: 'ready', postgres: 'ok', redis: 'ok' };
    } catch {
      throw new ServiceUnavailableException(
        'إحدى خدمات البنية المحلية غير متاحة',
      );
    } finally {
      await pool.end();
      if (redis.isOpen) redis.destroy();
    }
  }
}
@ApiTags('عرض التصميم — بيانات وهمية')
@Controller('api/v1/demo')
class DemoController {
  private checkMode() {
    if (process.env.PETRA_DEMO_MODE !== 'true') throw new NotFoundException();
  }
  @Get('customer')
  customer() {
    this.checkMode();
    return customerDemo;
  }
  @Get('clinics/demo-clinic/finance')
  finance() {
    this.checkMode();
    return financeDemo;
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const dbCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
    const parserStatus =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      [400, 413, 415].includes(Number(error.status))
        ? Number(error.status)
        : null;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserStatus
          ? parserStatus
          : ['23505', '23P01', '23514'].includes(dbCode)
            ? 409
            : 500;
    response.status(status).json({
      code: `HTTP_${status}`,
      message:
        status === 500
          ? 'حدث خطأ داخلي'
          : error instanceof HttpException
            ? error.message
            : status === 409
              ? 'هذا السجل موجود بالفعل'
              : 'تعذر إتمام الطلب',
      requestId: randomUUID(),
    });
  }
}
@Module({
  controllers: [
    HealthController,
    DemoController,
    IdentityController,
    CareController,
    SchedulingController,
    PetSafetyController,
    CommerceController,
    CatalogController,
    InventoryController,
    DeliveryController,
    CommercePricingController,
    GroomingController,
    CareLibraryController,
    FinancialReportsController,
    SocialDiscoveryController,
    ServicesController,
    BankController,
    MediaController,
    CommunityController,
    RescueController,
    RescueLifecycleController,
    RideController,
    OperationsController,
  ],
  providers: [
    OrganizationService,
    CareService,
    SchedulingService,
    PetSafetyService,
    CommerceService,
    CatalogService,
    InventoryService,
    DeliveryService,
    CommercePricingService,
    GroomingService,
    CareLibrary,
    FinancialReports,
    SocialDiscovery,
    FinanceService,
    ServicesService,
    CarePlansService,
    CommunityService,
    RescueService,
    RescueLifecycleService,
    RideService,
    OperationsService,
    MediaService,
    BankService,
  ],
})
class AppModule {}
async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });
  const server = app.getHttpAdapter().getInstance();
  registerRequestSecurity(server);
  app.use('/api/v1/media', express.json({ limit: '28mb', inflate: false }));
  app.use(express.json({ limit: '32kb', inflate: false }));
  registerIdentity(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new Errors());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Petra — منصة الرعاية والمجتمع والخدمات')
      .setDescription(
        'هوية ورعاية وتجارة ودفتر وخدمات ومجتمع وإنقاذ ونقل. التحصيل والصرف محليان في sandbox فقط.',
      )
      .setVersion('0.11.0')
      .build(),
  );
  if (process.env.APP_ENV === 'local')
    SwaggerModule.setup('api/docs', app, doc);
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.API_PORT ?? 4000),
    process.env.API_HOST ?? '127.0.0.1',
  );
  app.getHttpServer().requestTimeout = 30000;
  app.getHttpServer().headersTimeout = 10000;
}
void main();
