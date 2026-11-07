import { AgentInputError } from './errors';

// 保留旧版的空白判定与 Unicode 码点长度规则；trim() 对 BOM 和 U+001C..U+001F 的行为不同。
const nonWhitespace =
  /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;

export function validateAgentMessage(message: unknown): string {
  if (typeof message !== 'string' || !nonWhitespace.test(message) || [...message].length > 4000) {
    throw new AgentInputError();
  }
  return message;
}
