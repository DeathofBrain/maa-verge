/** Incremental SSE framing. UTF-8 decoding and typed event validation belong to the caller. */
export class ResponseEventStream {
  private line = '';
  private skipLineFeed = false;
  private event = '';
  private data: string[] = [];

  constructor(private readonly receive: (event: string, data: string) => void) {}

  push(text: string): void {
    for (const character of text) {
      if (this.skipLineFeed) {
        this.skipLineFeed = false;
        if (character === '\n') continue;
      }
      if (character === '\r' || character === '\n') {
        this.consumeLine();
        this.skipLineFeed = character === '\r';
      } else {
        this.line += character;
      }
    }
  }

  private consumeLine(): void {
    const line = this.line;
    this.line = '';
    if (!line) {
      if (this.data.length) this.receive(this.event, this.data.join('\n'));
      this.event = '';
      this.data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    if (field === 'data') this.data.push(value);
  }
}
