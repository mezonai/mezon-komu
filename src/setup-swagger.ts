import {INestApplication} from '@nestjs/common';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): INestApplication {
    const config = new DocumentBuilder()
        .setTitle('Komubot API')
        .setDescription('Komubot API description')
        .setVersion('1.0')
        .addBearerAuth(undefined, 'defaultToken')
        .build();
    const document = SwaggerModule.createDocument(app, config, {
        operationIdFactory: (controllerKey: string, methodKey: string) =>
            controllerKey
                ? `${methodKey}${controllerKey.replace('Controller', '')}`
                : methodKey,
    });
    console.log('asdasdads')
    SwaggerModule.setup('swagger', app, document);

    return app;
}
