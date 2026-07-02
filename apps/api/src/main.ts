import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // Interactive API docs at /docs — set SWAGGER=off to disable (e.g. in prod).
  if (process.env.SWAGGER !== 'off') {
    const config = new DocumentBuilder()
      .setTitle('RealPlay Tournaments API')
      .setDescription(
        'Create tournaments, ingest bet events, and read the live/final leaderboard. ' +
          'Use "Try it out" to exercise the endpoints.',
      )
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen({ port: Number(process.env.API_PORT ?? 3000), host: '0.0.0.0' });
  console.log(`API listening on ${await app.getUrl()}`);
  console.log(`API docs at ${await app.getUrl()}/docs`);
}

bootstrap();
