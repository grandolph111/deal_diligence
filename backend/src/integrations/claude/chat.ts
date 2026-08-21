import { getClaudeClient, getModelId } from './client';
import { CHAT_SYSTEM_PROMPT } from './prompts/chat';
import { chatResponseSchema, type ChatResponse } from './schema';
import type { AttachedDoc } from './riskReport';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Headroom for an answer plus its citations; a cut-off tool call loses both. */
const CHAT_MAX_TOKENS = 8192;

export const runChat = async (args: {
  brief?: string | null;
  pinnedDocs?: AttachedDoc[];
  history: ChatTurn[];
  userMessage: string;
}): Promise<ChatResponse & { truncated: boolean }> => {
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
    max_tokens: CHAT_MAX_TOKENS,
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

  // A tool call cut off at max_tokens arrives as half-written JSON: the reply
  // is there but its tail is missing, and the citations array is a fragment.
  // Salvaging the prose beats failing the turn — but the caller has to know it
  // is incomplete, because a truncated answer that presents itself as whole is
  // the worst of the three outcomes.
  const truncated = response.stop_reason === 'max_tokens';

  const parsed = chatResponseSchema.safeParse(toolBlock.input);
  if (parsed.success) {
    return { ...parsed.data, truncated };
  }

  const salvaged = (toolBlock.input as { content?: unknown })?.content;
  if (typeof salvaged === 'string' && salvaged.trim()) {
    return { content: salvaged, citations: [], truncated: true };
  }

  throw new Error(
    `Claude chat returned an unusable reply${truncated ? ' (truncated at max_tokens)' : ''}`
  );
};
