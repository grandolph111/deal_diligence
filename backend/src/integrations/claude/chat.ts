import { getClaudeClient, getModelId } from './client';
import { CHAT_SYSTEM_PROMPT } from './prompts/chat';
import { chatResponseSchema, type ChatResponse } from './schema';
import type { AttachedDoc } from './riskReport';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const runChat = async (args: {
  brief?: string | null;
  pinnedDocs?: AttachedDoc[];
  history: ChatTurn[];
  userMessage: string;
}): Promise<ChatResponse> => {
  const client = getClaudeClient();
  const model = getModelId('chat');

  const briefBlock = args.brief
    ? `# Deal Brief\n\n${args.brief}`
    : '# Deal Brief\n\n(not available — the deal has no reconciled brief yet)';

  const pinnedBlock = args.pinnedDocs?.length
    ? `# Pinned document fact sheets\n\n${args.pinnedDocs
        .map(
          (d) =>
            `<document documentId="${d.documentId}" name="${d.documentName}">\n${d.factSheetMarkdown}\n</document>`
        )
        .join('\n\n')}`
    : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priming: any[] = [
    {
      type: 'text',
      text: briefBlock,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (pinnedBlock) {
    priming.push({
      type: 'text',
      text: pinnedBlock,
      cache_control: { type: 'ephemeral' },
    });
  }
  priming.push({
    type: 'text',
    text: 'Acknowledge you have loaded the deal brief and any pinned documents. Reply by calling submit_chat with {"content":"Ready.","citations":[]}',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'user', content: priming },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'ack-ready',
          name: 'submit_chat',
          input: { content: 'Ready.', citations: [] },
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'ack-ready',
          content: 'ok',
        },
      ],
    },
    ...args.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: args.userMessage },
  ];

  // Custom runToolUse pass since we have multi-turn messages.
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: CHAT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'submit_chat',
        description: 'Emit the chat reply + citations.',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  documentId: { type: 'string' },
                  pageNumber: { type: ['integer', 'null'] },
                  snippet: { type: 'string' },
                },
                required: ['documentId', 'snippet'],
              },
            },
          },
          required: ['content', 'citations'],
        } as any,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_chat' },
    messages,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolBlock = (response.content as any[]).find(
    (c: { type?: string }) => c?.type === 'tool_use'
  );
  if (!toolBlock) throw new Error('Claude chat returned no tool_use');
  return chatResponseSchema.parse(toolBlock.input);
};
