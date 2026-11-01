import { rpc, type RpcContract } from '@maaverge/contracts';

export type PrimitiveDescriptor = RpcContract['results']['primitive.catalog.get']['items'][number];
export type PrimitiveResult = RpcContract['results']['debug.primitive.invoke'];
export type DebugSession = RpcContract['results']['debug.session.start'];
export const debugRpc = rpc;
