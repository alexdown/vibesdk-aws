"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/lambda/ai-gateway/handler.ts
var handler_exports = {};
__export(handler_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(handler_exports);

// lib/lambda/ai-gateway/types.ts
var PROVIDERS = [
  {
    name: "bedrock",
    type: "bedrock",
    modelMapping: {
      "claude-3-sonnet": "anthropic.claude-3-sonnet-20240229-v1:0",
      "claude-3-haiku": "anthropic.claude-3-haiku-20240307-v1:0",
      "claude-3-opus": "anthropic.claude-3-opus-20240229-v1:0"
    },
    priority: 1
  },
  {
    name: "anthropic",
    type: "anthropic",
    modelMapping: {
      "claude-3-sonnet": "claude-3-sonnet-20240229",
      "claude-3-haiku": "claude-3-haiku-20240307",
      "claude-3-opus": "claude-3-opus-20240229"
    },
    priority: 2
  },
  {
    name: "openai",
    type: "openai",
    modelMapping: {
      "gpt-4": "gpt-4-turbo-preview",
      "gpt-4o": "gpt-4o",
      "gpt-3.5": "gpt-3.5-turbo"
    },
    priority: 3
  }
];
function getProvider(model) {
  return PROVIDERS.find((p) => Object.keys(p.modelMapping).includes(model));
}
function getProviderByName(name) {
  return PROVIDERS.find((p) => p.name === name);
}

// lib/lambda/ai-gateway/bedrock.ts
var import_client_bedrock_runtime = require("@aws-sdk/client-bedrock-runtime");
var client = new import_client_bedrock_runtime.BedrockRuntimeClient({});
async function invokeBedrock(modelId, request) {
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: request.maxTokens || 4096,
    temperature: request.temperature ?? 0.7,
    messages: request.messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content
    }))
  };
  const systemMessage = request.messages.find((m) => m.role === "system");
  if (systemMessage) {
    body.system = systemMessage.content;
    body.messages = body.messages.filter((m) => m.content !== systemMessage.content);
  }
  const response2 = await client.send(new import_client_bedrock_runtime.InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body)
  }));
  const result = JSON.parse(new TextDecoder().decode(response2.body));
  return {
    content: result.content[0]?.text || "",
    model: request.model,
    provider: "bedrock",
    usage: {
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0
    }
  };
}

// lib/lambda/ai-gateway/anthropic.ts
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
async function invokeAnthropic(modelId, request) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const systemMessage = request.messages.find((m) => m.role === "system");
  const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
  const body = {
    model: modelId,
    max_tokens: request.maxTokens || 4096,
    temperature: request.temperature ?? 0.7,
    messages
  };
  if (systemMessage) {
    body.system = systemMessage.content;
  }
  const response2 = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  if (!response2.ok) {
    throw new Error(`Anthropic API error: ${response2.status}`);
  }
  const result = await response2.json();
  return {
    content: result.content[0]?.text || "",
    model: request.model,
    provider: "anthropic",
    usage: {
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0
    }
  };
}

// lib/lambda/ai-gateway/openai.ts
var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
async function invokeOpenAI(modelId, request) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const messages = request.messages.map((m) => ({
    role: m.role,
    content: m.content
  }));
  const body = {
    model: modelId,
    max_tokens: request.maxTokens || 4096,
    temperature: request.temperature ?? 0.7,
    messages
  };
  const response2 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!response2.ok) {
    throw new Error(`OpenAI API error: ${response2.status}`);
  }
  const result = await response2.json();
  return {
    content: result.choices[0]?.message?.content || "",
    model: request.model,
    provider: "openai",
    usage: {
      inputTokens: result.usage?.prompt_tokens || 0,
      outputTokens: result.usage?.completion_tokens || 0
    }
  };
}

// lib/lambda/ai-gateway/handler.ts
var FALLBACK_PROVIDER = process.env.FALLBACK_PROVIDER || "anthropic";
function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" },
    body: JSON.stringify(body)
  };
}
async function invokeProvider(providerType, modelId, request) {
  switch (providerType) {
    case "bedrock":
      return invokeBedrock(modelId, request);
    case "anthropic":
      return invokeAnthropic(modelId, request);
    case "openai":
      return invokeOpenAI(modelId, request);
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}
async function handler(event) {
  try {
    const request = JSON.parse(event.body || "{}");
    if (!request.model || !request.messages?.length) {
      return response(400, { error: "Missing model or messages" });
    }
    const provider = getProvider(request.model);
    if (!provider) {
      return response(400, { error: `Unknown model: ${request.model}` });
    }
    const modelId = provider.modelMapping[request.model];
    try {
      const result = await invokeProvider(provider.type, modelId, request);
      return response(200, result);
    } catch (primaryError) {
      console.error("Primary provider failed:", primaryError);
      const fallback = getProviderByName(FALLBACK_PROVIDER);
      if (fallback && fallback.name !== provider.name) {
        const fallbackModelId = fallback.modelMapping[request.model];
        if (fallbackModelId) {
          try {
            const result = await invokeProvider(fallback.type, fallbackModelId, request);
            return response(200, { ...result, fallback: true });
          } catch (fallbackError) {
            console.error("Fallback provider failed:", fallbackError);
          }
        }
      }
      throw primaryError;
    }
  } catch (error) {
    console.error("AI Gateway error:", error);
    return response(500, { error: "AI inference failed" });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
