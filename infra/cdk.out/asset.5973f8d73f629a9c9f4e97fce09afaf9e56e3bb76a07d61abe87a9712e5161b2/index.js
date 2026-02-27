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

// lib/lambda/api/apps.ts
var apps_exports = {};
__export(apps_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(apps_exports);

// lib/database/service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var DatabaseService = class {
  client;
  tableName;
  constructor(tableName) {
    this.tableName = tableName || process.env.TABLE_NAME;
    this.client = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
  }
  async get(key) {
    const result = await this.client.send(new import_lib_dynamodb.GetCommand({
      TableName: this.tableName,
      Key: key
    }));
    return result.Item || null;
  }
  async put(item) {
    await this.client.send(new import_lib_dynamodb.PutCommand({
      TableName: this.tableName,
      Item: item
    }));
    return item;
  }
  async update(key, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (k !== "PK" && k !== "SK" && v !== void 0) {
        const attrName = `#${k}`;
        const attrValue = `:${k}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = k;
        expressionAttributeValues[attrValue] = v;
      }
    });
    if (updateExpressions.length === 0) return this.get(key);
    const result = await this.client.send(new import_lib_dynamodb.UpdateCommand({
      TableName: this.tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW"
    }));
    return result.Attributes || null;
  }
  async delete(key) {
    await this.client.send(new import_lib_dynamodb.DeleteCommand({
      TableName: this.tableName,
      Key: key
    }));
  }
  async query(keyCondition, keyValues, options = {}) {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: { ...keyValues, ...options.expressionAttributeValues },
      IndexName: options.indexName,
      Limit: options.limit,
      ScanIndexForward: options.scanForward ?? true,
      ExclusiveStartKey: options.exclusiveStartKey,
      FilterExpression: options.filterExpression,
      ExpressionAttributeNames: options.expressionAttributeNames
    };
    const result = await this.client.send(new import_lib_dynamodb.QueryCommand(params));
    return {
      items: result.Items || [],
      lastKey: result.LastEvaluatedKey
    };
  }
  async queryByPK(pk, options = {}) {
    return this.query("PK = :pk", { ":pk": pk }, options);
  }
  async queryByGSI(indexName, pkName, pkValue, options = {}) {
    return this.query(
      `${pkName} = :pk`,
      { ":pk": pkValue },
      { ...options, indexName }
    );
  }
};
var dbInstance = null;
function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

// lib/database/schema.ts
var Keys = {
  user: (userId) => ({ PK: `USER#${userId}`, SK: "PROFILE" }),
  session: (sessionId) => ({ PK: `SESSION#${sessionId}`, SK: "META" }),
  app: (appId) => ({ PK: `APP#${appId}`, SK: "META" }),
  agent: (agentId) => ({ PK: `AGENT#${agentId}`, SK: "STATE" }),
  message: (agentId, timestamp, messageId) => ({
    PK: `AGENT#${agentId}`,
    SK: `MSG#${timestamp}#${messageId}`
  }),
  connection: (connectionId) => ({ PK: `CONN#${connectionId}`, SK: "META" }),
  rateLimit: (identifier, endpoint, windowStart) => ({
    PK: `RATE#${identifier}#${endpoint}`,
    SK: `WINDOW#${windowStart}`
  })
};

// lib/database/app-service.ts
function generateAppId() {
  return `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
async function createApp(input) {
  const db = getDb();
  const appId = generateAppId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const app = {
    ...Keys.app(appId),
    GSI2PK: `USER#${input.userId}`,
    GSI2SK: now,
    title: input.title,
    description: input.description,
    originalPrompt: input.originalPrompt,
    framework: input.framework,
    userId: input.userId,
    visibility: input.visibility || "private",
    status: "draft",
    parentAppId: input.parentAppId,
    createdAt: now,
    updatedAt: now
  };
  return db.put(app);
}
async function getAppById(appId) {
  const db = getDb();
  return db.get(Keys.app(appId));
}
async function updateApp(appId, input) {
  const db = getDb();
  return db.update(Keys.app(appId), {
    ...input,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function listAppsByUser(userId, options = {}) {
  const db = getDb();
  const queryOptions = {
    indexName: "GSI2",
    limit: options.limit || 20,
    scanForward: options.scanForward ?? false,
    filterExpression: "attribute_not_exists(deletedAt)"
  };
  if (options.cursor) {
    queryOptions.exclusiveStartKey = JSON.parse(Buffer.from(options.cursor, "base64url").toString());
  }
  const result = await db.queryByGSI("GSI2", "GSI2PK", `USER#${userId}`, queryOptions);
  return {
    items: result.items,
    lastKey: result.lastKey
  };
}
async function softDeleteApp(appId) {
  const db = getDb();
  return db.update(Keys.app(appId), {
    deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// lib/lambda/api/apps.ts
var corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};
function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}
async function handler(event) {
  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return response(401, { error: "Unauthorized" });
  const method = event.httpMethod;
  const appId = event.pathParameters?.appId;
  try {
    if (method === "GET" && !appId) {
      const cursor = event.queryStringParameters?.cursor;
      const limit = parseInt(event.queryStringParameters?.limit || "20", 10);
      const result = await listAppsByUser(userId, { limit, cursor });
      return response(200, result);
    }
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const app = await createApp({ ...body, userId });
      return response(201, app);
    }
    if (method === "GET" && appId) {
      const app = await getAppById(appId);
      if (!app || app.userId !== userId) return response(404, { error: "Not found" });
      return response(200, app);
    }
    if (method === "PUT" && appId) {
      const existing = await getAppById(appId);
      if (!existing || existing.userId !== userId) return response(404, { error: "Not found" });
      const body = JSON.parse(event.body || "{}");
      const app = await updateApp(appId, body);
      return response(200, app);
    }
    if (method === "DELETE" && appId) {
      const existing = await getAppById(appId);
      if (!existing || existing.userId !== userId) return response(404, { error: "Not found" });
      await softDeleteApp(appId);
      return response(204, null);
    }
    return response(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Apps handler error:", error);
    return response(500, { error: "Internal error" });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
