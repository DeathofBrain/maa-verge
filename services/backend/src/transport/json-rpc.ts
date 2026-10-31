import { RpcError, systemErrorMessage } from '@backend/shared/errors';
import { isWireFloat } from '@backend/shared/wire-json';

interface RequestHandler {
  handle(method: string, params?: unknown): Promise<unknown>;
  logs?: {
    diagnostics: {
      write(level: string, message: string, data?: unknown): void;
    };
  };
}

export async function processRequest(runtime: RequestHandler, request: any): Promise<any> {
  const started = performance.now();
  const id =
    request && typeof request === 'object' && !Array.isArray(request) ? (request.id ?? null) : null;
  try {
    if (
      !request ||
      typeof request !== 'object' ||
      Array.isArray(request) ||
      request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' ||
      ('id' in request &&
        id !== null &&
        typeof id !== 'string' &&
        !(typeof id === 'number' && Number.isSafeInteger(id) && !isWireFloat(request, 'id')))
    )
      throw new RpcError(-32600, '无效的 JSON-RPC 请求');
    const result = await runtime.handle(request.method, request.params);
    if (
      ![
        'app.snapshot',
        'home.info',
        'stages.list',
        'run.detail',
        'run.artifact',
        'device.frame',
        'logs.info',
      ].includes(request.method)
    )
      runtime.logs?.diagnostics.write('info', 'rpc.completed', {
        method: request.method,
        requestId: id,
        operationId: request.params?.requestId,
        durationMs: Math.round(performance.now() - started),
      });
    return 'id' in request ? { jsonrpc: '2.0', id, result } : undefined;
  } catch (error) {
    runtime.logs?.diagnostics.write('error', 'rpc.failed', {
      method: request?.method,
      requestId: id,
      operationId: request?.params?.requestId,
      durationMs: Math.round(performance.now() - started),
      code: error instanceof RpcError ? error.code : -32603,
      error: error instanceof Error ? error.stack : String(error),
      detail: error instanceof RpcError ? error.data : undefined,
    });
    if (error instanceof RpcError) {
      if (request && typeof request === 'object' && !('id' in request) && error.code !== -32600)
        return undefined;
      return { jsonrpc: '2.0', id, error: error.asDict() };
    }
    console.error('本地运行时请求失败:', error);
    const message = systemErrorMessage(error);
    if (message)
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message,
          data: error instanceof Error ? error.message : String(error),
        },
      };
    return { jsonrpc: '2.0', id, error: { code: -32603, message: '本地运行时内部错误' } };
  }
}
