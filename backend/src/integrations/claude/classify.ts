import { PDFDocument } from 'pdf-lib';
import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { CLASSIFY_SYSTEM_PROMPT } from './prompts/classify';
import { classifyResponseSchema, type ClassifyResponse } from './schema';

/**
 * Slice the first N pages from a PDF buffer. Cheap classifier input.
 */
export const slicePdfPages = async (
  bytes: Buffer,
  pageCount: number
): Promise<Buffer> => {
  const src = await PDFDocument.load(bytes);
  const total = src.getPageCount();
  if (total <= pageCount) return bytes;
  const dst = await PDFDocument.create();
  const pagesToCopy = Array.from({ length: pageCount }, (_, i) => i);
  const copied = await dst.copyPages(src, pagesToCopy);
  copied.forEach((p) => dst.addPage(p));
  const out = await dst.save();
  return Buffer.from(out);
};

export const classifyDocument = async (args: {
  pdfBytes: Buffer;
  filename: string;
  pagesToRead?: number;
}): Promise<ClassifyResponse> => {
  const client = getClaudeClient();
  const model = getModelId('chat'); // Haiku tier
  const pdfSlice = await slicePdfPages(args.pdfBytes, args.pagesToRead ?? 2);

  const { input } = await runToolUse<ClassifyResponse>({
    client,
    model,
    maxTokens: 512,
    systemPrompt: CLASSIFY_SYSTEM_PROMPT,
    messages: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfSlice.toString('base64'),
        },
      },
      {
        type: 'text',
        text: `Filename: ${args.filename}\n\nClassify this document.`,
      },
    ],
    toolName: 'submit_classification',
    toolDescription: 'Emit the document type classification with confidence.',
    toolSchema: classifyResponseSchema,
  });

  return input;
};

export const classifyTextSample = async (args: {
  text: string;
  filename: string;
}): Promise<ClassifyResponse> => {
  const client = getClaudeClient();
  const model = getModelId('chat');
  const sample = args.text.slice(0, 6000);
  const { input } = await runToolUse<ClassifyResponse>({
    client,
    model,
    maxTokens: 512,
    systemPrompt: CLASSIFY_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Filename: ${args.filename}\n\n---BEGIN DOCUMENT---\n${sample}\n---END DOCUMENT---\n\nClassify this document.`,
      },
    ],
    toolName: 'submit_classification',
    toolDescription: 'Emit the document type classification with confidence.',
    toolSchema: classifyResponseSchema,
  });
  return input;
};
