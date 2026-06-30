import { FunctionCallingConfigMode, type FunctionDeclaration, GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type {
  FunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputContent,
  Tool,
} from "openai/resources/responses/responses";
import { envFlag, envValue, settings } from "./config";

const JSON_SCHEMA_TYPE_TO_GEMINI_TYPE = {
  array: "ARRAY",
  boolean: "BOOLEAN",
  integer: "INTEGER",
  number: "NUMBER",
  object: "OBJECT",
  string: "STRING",
} as const;

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  nullable?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  enum?: string[];
  [key: string]: unknown;
};

export type LlmProviderMode =
  | "openai"
  | "gemini-enterprise-agent-platform"
  | "gemini-developer-api";

export type LlmConfig = {
  provider: LlmProviderMode;
  credentialSource: string;
  configured: boolean;
  model: string;
  project?: string | undefined;
  projectNumber?: string | undefined;
  location?: string | undefined;
};

export type LlmInputPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string };

export type ModelFunctionCall = {
  name?: string | undefined;
  args?: Record<string, unknown>;
  callId?: string | undefined;
};

export type ModelFunctionResponse = {
  name: string;
  response: Record<string, unknown>;
  callId?: string | undefined;
};

export type LlmConversationItem =
  | { role: "user"; text: string }
  | { role: "assistant"; functionCalls: ModelFunctionCall[] }
  | { role: "tool"; functionResponses: ModelFunctionResponse[] };

export type LlmToolDeclaration = {
  name: string;
  description?: string;
  parametersJsonSchema?: JsonSchema;
};

function developerApiKey(): string | undefined {
  return envValue("GEMINI_API_KEY") ?? envValue("GOOGLE_API_KEY");
}

function enterpriseApiKey(): string | undefined {
  if (envFlag("GOOGLE_GENAI_USE_ENTERPRISE")) {
    return envValue("GOOGLE_AGENT_PLATFORM_KEY") ?? envValue("GOOGLE_API_KEY");
  }

  return envValue("GOOGLE_AGENT_PLATFORM_KEY");
}

function shouldUseEnterprise(): boolean {
  if (envFlag("GOOGLE_GENAI_USE_ENTERPRISE")) {
    return true;
  }

  if (enterpriseApiKey()) {
    return true;
  }

  return Boolean(envValue("GOOGLE_CLOUD_PROJECT") && !developerApiKey());
}

function geminiConfig(): LlmConfig {
  const project = envValue("GOOGLE_CLOUD_PROJECT");
  const projectNumber = envValue("GEMINI_PROJECT_NUMBER");
  const location = settings().GOOGLE_CLOUD_LOCATION;

  if (shouldUseEnterprise()) {
    const apiKey = enterpriseApiKey();
    return {
      provider: "gemini-enterprise-agent-platform",
      credentialSource: apiKey
        ? envValue("GOOGLE_AGENT_PLATFORM_KEY")
          ? "GOOGLE_AGENT_PLATFORM_KEY"
          : "GOOGLE_API_KEY"
        : "application-default-credentials",
      configured: Boolean(apiKey ?? project),
      model: settings().GEMINI_MODEL,
      project,
      projectNumber,
      location,
    };
  }

  const apiKey = developerApiKey();

  return {
    provider: "gemini-developer-api",
    credentialSource: apiKey
      ? envValue("GEMINI_API_KEY")
        ? "GEMINI_API_KEY"
        : "GOOGLE_API_KEY"
      : "not-configured",
    configured: Boolean(apiKey),
    model: settings().GEMINI_MODEL,
    project,
    projectNumber,
    location,
  };
}

export function llmConfig(): LlmConfig {
  if (settings().LLM_PROVIDER === "gemini") {
    return geminiConfig();
  }

  const apiKey = envValue("OPENAI_API_KEY");
  return {
    provider: "openai",
    credentialSource: apiKey ? "OPENAI_API_KEY" : "not-configured",
    configured: Boolean(apiKey),
    model: settings().OPENAI_MODEL,
  };
}

export function modelName(): string {
  return llmConfig().model;
}

export function hasUsableLlmCredentials(): boolean {
  return llmConfig().configured;
}

function createGeminiClient(): GoogleGenAI {
  const config = geminiConfig();

  if (config.provider === "gemini-enterprise-agent-platform") {
    const apiKey = enterpriseApiKey();

    if (apiKey) {
      return new GoogleGenAI({
        enterprise: true,
        apiKey,
        apiVersion: "v1",
      });
    }

    if (!config.project) {
      throw new Error(
        "Set GOOGLE_AGENT_PLATFORM_KEY, or set GOOGLE_CLOUD_PROJECT for Application Default Credentials.",
      );
    }

    return new GoogleGenAI({
      enterprise: true,
      project: config.project,
      location: config.location ?? "global",
      apiVersion: "v1",
    });
  }

  const apiKey = developerApiKey();

  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY for Gemini Developer API use.");
  }

  return new GoogleGenAI({ apiKey });
}

function createOpenAIClient(): OpenAI {
  const apiKey = envValue("OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY for OpenAI provider use.");
  }

  return new OpenAI({ apiKey, baseURL: envValue("OPENAI_BASE_URL") });
}

function openAIReasoning(): ResponseCreateParamsNonStreaming["reasoning"] {
  const effort = settings().OPENAI_REASONING_EFFORT;
  if (!effort || effort === "none") {
    return undefined;
  }

  return effort ? { effort } : undefined;
}

function normalizeJsonSchema(schema: JsonSchema): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "nullable") {
      continue;
    }

    if (key === "type" && typeof value === "string") {
      const lowered = value.toLowerCase();
      normalized.type = schema.nullable ? [lowered, "null"] : lowered;
      continue;
    }

    if (key === "type" && Array.isArray(value)) {
      normalized.type = schema.nullable ? [...value.map(String), "null"] : value.map(String);
      continue;
    }

    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      normalized.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([property, propertySchema]) => [
          property,
          normalizeJsonSchema(propertySchema),
        ]),
      );
      if (schema.type === "object" && schema.additionalProperties === undefined) {
        normalized.additionalProperties = false;
      }
      continue;
    }

    if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      normalized.items = normalizeJsonSchema(value as JsonSchema);
      continue;
    }

    if (
      key === "additionalProperties" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      normalized.additionalProperties = normalizeJsonSchema(value as JsonSchema);
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      converted.type =
        JSON_SCHEMA_TYPE_TO_GEMINI_TYPE[
          value.toLowerCase() as keyof typeof JSON_SCHEMA_TYPE_TO_GEMINI_TYPE
        ] ?? value;
      continue;
    }

    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      converted.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([property, propertySchema]) => [
          property,
          toGeminiSchema(propertySchema),
        ]),
      );
      continue;
    }

    if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      converted.items = toGeminiSchema(value as JsonSchema);
      continue;
    }

    converted[key] = value;
  }

  return converted;
}

function openAIInputFromParts(parts: LlmInputPart[]): ResponseInput {
  return [
    {
      role: "user",
      content: parts.map((part): ResponseInputContent => {
        if (part.type === "image") {
          return {
            type: "input_image",
            image_url: `data:${part.mimeType};base64,${part.data}`,
            detail: "auto",
          };
        }

        return { type: "input_text", text: part.text };
      }),
    },
  ];
}

function openAIInputFromConversation(messages: LlmConversationItem[]): ResponseInput {
  return messages.flatMap((message, messageIndex): ResponseInput => {
    if (message.role === "user") {
      return [
        {
          role: "user",
          content: [{ type: "input_text", text: message.text }],
        },
      ];
    }

    if (message.role === "assistant") {
      return message.functionCalls.map((call, index) => ({
        type: "function_call",
        call_id: call.callId ?? `${call.name ?? "tool"}-${messageIndex}-${index}`,
        name: call.name ?? "unknown_tool",
        arguments: JSON.stringify(call.args ?? {}),
      }));
    }

    return message.functionResponses.map((functionResponse, index) => ({
      type: "function_call_output",
      call_id: functionResponse.callId ?? `${functionResponse.name}-${messageIndex}-${index}`,
      output: JSON.stringify(functionResponse.response),
    }));
  });
}

function geminiContentsFromParts(parts: LlmInputPart[]) {
  return [
    {
      role: "user",
      parts: parts.map((part) =>
        part.type === "image"
          ? { inlineData: { mimeType: part.mimeType, data: part.data } }
          : { text: part.text },
      ),
    },
  ];
}

function geminiContentsFromConversation(messages: LlmConversationItem[]) {
  return messages.map((message) => {
    if (message.role === "user") {
      return { role: "user", parts: [{ text: message.text }] };
    }

    if (message.role === "assistant") {
      return {
        role: "model",
        parts: message.functionCalls.map((call) => ({
          functionCall: { name: call.name ?? "unknown_tool", args: call.args ?? {} },
        })),
      };
    }

    return {
      role: "user",
      parts: message.functionResponses.map((functionResponse) => ({
        functionResponse: {
          name: functionResponse.name,
          response: functionResponse.response,
        },
      })),
    };
  });
}

function openAITools(toolDeclarations: LlmToolDeclaration[]): Tool[] {
  return toolDeclarations.map(
    (tool): FunctionTool => ({
      type: "function",
      name: tool.name,
      description: tool.description ?? null,
      parameters: normalizeJsonSchema(tool.parametersJsonSchema ?? { type: "object" }),
      strict: false,
    }),
  );
}

function geminiTools(toolDeclarations: LlmToolDeclaration[]): FunctionDeclaration[] {
  return toolDeclarations.map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.parametersJsonSchema
      ? { parametersJsonSchema: toGeminiSchema(tool.parametersJsonSchema) }
      : {}),
  }));
}

function openAIFunctionCalls(response: { output?: unknown[] }): ModelFunctionCall[] {
  return (response.output ?? [])
    .filter((item): item is ResponseFunctionToolCall => {
      return Boolean(
        item && typeof item === "object" && (item as { type?: unknown }).type === "function_call",
      );
    })
    .map((item) => {
      let args: Record<string, unknown> = {};

      try {
        const parsed = JSON.parse(item.arguments);
        args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        args = {};
      }

      return {
        name: item.name,
        args,
        callId: item.call_id,
      };
    });
}

export async function generateLlmText({
  prompt,
  parts,
  messages,
  systemInstruction,
  responseSchema,
  schemaName = "starflow_response",
  temperature,
  maxOutputTokens,
}: {
  prompt?: string;
  parts?: LlmInputPart[];
  messages?: LlmConversationItem[];
  systemInstruction: string;
  responseSchema?: JsonSchema;
  schemaName?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const config = llmConfig();

  if (config.provider === "openai") {
    const client = createOpenAIClient();
    const input = messages
      ? openAIInputFromConversation(messages)
      : openAIInputFromParts(parts ?? [{ type: "text", text: prompt ?? "" }]);
    const request: ResponseCreateParamsNonStreaming = {
      model: config.model,
      instructions: systemInstruction,
      input,
      store: false,
      text: responseSchema
        ? {
            format: {
              type: "json_schema",
              name: schemaName,
              schema: normalizeJsonSchema(responseSchema),
              strict: false,
            },
          }
        : { verbosity: "low" },
    };
    const reasoning = openAIReasoning();

    if (maxOutputTokens !== undefined) {
      request.max_output_tokens = maxOutputTokens;
    }

    if (reasoning) {
      request.reasoning = reasoning;
    }

    if (temperature !== undefined) {
      request.temperature = temperature;
    }

    const response = await client.responses.create(request);

    return response.output_text?.trim() || "No text was returned by the model.";
  }

  const client = createGeminiClient();
  const response = await client.models.generateContent({
    model: config.model,
    contents: messages
      ? geminiContentsFromConversation(messages)
      : geminiContentsFromParts(parts ?? [{ type: "text", text: prompt ?? "" }]),
    config: {
      systemInstruction,
      ...(responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(responseSchema),
          }
        : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    },
  });

  return response.text?.trim() || "No text was returned by the model.";
}

export async function generateLlmToolStep({
  messages,
  systemInstruction,
  toolDeclarations,
  temperature,
  maxOutputTokens,
}: {
  messages: LlmConversationItem[];
  systemInstruction: string;
  toolDeclarations: LlmToolDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<{ text: string; functionCalls: ModelFunctionCall[] }> {
  const config = llmConfig();

  if (config.provider === "openai") {
    const client = createOpenAIClient();
    const request: ResponseCreateParamsNonStreaming = {
      model: config.model,
      instructions: systemInstruction,
      input: openAIInputFromConversation(messages),
      parallel_tool_calls: false,
      store: false,
      tool_choice: "auto",
      tools: openAITools(toolDeclarations),
      text: { verbosity: "low" },
    };
    const reasoning = openAIReasoning();

    if (maxOutputTokens !== undefined) {
      request.max_output_tokens = maxOutputTokens;
    }

    if (reasoning) {
      request.reasoning = reasoning;
    }

    if (temperature !== undefined) {
      request.temperature = temperature;
    }

    const response = await client.responses.create(request);

    return {
      text: response.output_text?.trim() ?? "",
      functionCalls: openAIFunctionCalls(response),
    };
  }

  const client = createGeminiClient();
  const response = await client.models.generateContent({
    model: config.model,
    contents: geminiContentsFromConversation(messages),
    config: {
      systemInstruction,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
      tools: [{ functionDeclarations: geminiTools(toolDeclarations) }],
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    },
  });

  return {
    text: response.text?.trim() ?? "",
    functionCalls:
      response.functionCalls?.map((call) => ({
        ...(call.name ? { name: call.name } : {}),
        args: call.args ?? {},
      })) ?? [],
  };
}
