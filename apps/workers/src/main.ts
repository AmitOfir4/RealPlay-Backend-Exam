import { NestFactory } from '@nestjs/core';
import { WorkersModule } from './workers.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkersModule);
  app.enableShutdownHooks();
  console.log('Workers app running');
}

bootstrap();
