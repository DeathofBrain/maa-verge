import { AgentInputError } from './errors';

// Preserve the retained Python agent's whitespace and code-point length rules.
// JavaScript trim() treats BOM differently and does not strip U+001C..U+001F.
const nonWhitespace =
  /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;

export function validateAgentMessage(message: unknown): string {
  if (typeof message !== 'string' || !nonWhitespace.test(message) || [...message].length > 4000) {
    throw new AgentInputError();
  }
  return message;
}
