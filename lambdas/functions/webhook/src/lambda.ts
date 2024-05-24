import middy from '@middy/core';
import { logger, setContext, captureLambdaHandler, tracer } from '@terraform-aws-github-runner/aws-powertools-util';
import { APIGatewayAuthorizerResult, APIGatewayEvent, APIGatewayRequestAuthorizerEventV2, Context } from 'aws-lambda';

import { authorize, handle } from './webhook';
import { Config } from './ConfigResolver';
import ValidationError from './ValidatonError';

export interface Response {
  statusCode: number;
  body?: string;
}

export async function authorizer(
  event: APIGatewayRequestAuthorizerEventV2,
  context: Context,
): Promise<APIGatewayAuthorizerResult> {
  setContext(context, 'lambda.ts');
  const config = await Config.load();

  logger.logEventIfEnabled(event);
  logger.debug('Loading config', { config });

  return await authorize(event.headers ?? {}, event.routeArn, config);
}

export async function githubWebhook(event: APIGatewayEvent, context: Context): Promise<Response> {
  setContext(context, 'lambda.ts');
  const config = await Config.load();

  logger.logEventIfEnabled(event);
  logger.debug('Loading config', { config });

  let result: Response;
  try {
    result = await handle(event.headers, event.body as string, config);
  } catch (e) {
    logger.error(`Failed to handle webhook event`, { error: e });
    if (e instanceof ValidationError) {
      result = {
        statusCode: e.statusCode,
        body: e.message,
      };
    } else {
      result = {
        statusCode: 500,
        body: 'Check the Lambda logs for the error details.',
      };
    }
  }
  return result;
}

const addMiddleware = () => {
  const handler = captureLambdaHandler(tracer);
  if (!handler) {
    return;
  }
  middy(authorizer).use(handler);
  middy(githubWebhook).use(handler);
};

addMiddleware();
