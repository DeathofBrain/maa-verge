export class RpcError extends Error {
  constructor(public code: number, message: string, public data?: unknown) { super(message); }
  asDict() { return { code: this.code, message: this.message, ...(this.data === undefined ? {} : { data: this.data }) }; }
}
