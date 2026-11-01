import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const server = new McpServer({ name: 'maaverge-synthetic-stdio', version: '1.0.0' });
server.registerTool(
  'fixture_env',
  {
    inputSchema: fromJsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          label: process.env.MCP_FIXTURE_LABEL,
          inherited: process.env.MAAVERGE_SHOULD_NOT_INHERIT ?? 'absent',
        }),
      },
    ],
  }),
);
console.error('synthetic stderr diagnostic; stdout remains MCP only');
await server.connect(new StdioServerTransport());
