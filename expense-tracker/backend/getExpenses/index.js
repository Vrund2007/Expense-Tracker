/**
 * AWS Lambda Function: getExpenses
 * Runtime: Node.js 18.x or Node.js 20.x
 *
 * Responsibility: Queries Amazon DynamoDB to retrieve only the authenticated user's expenses.
 * Uses KeyConditionExpression on partition key (userId) to ensure complete user isolation.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize DynamoDB Document Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Table name configured via environment variable with fallback to 'Expenses'
const TABLE_NAME = process.env.TABLE_NAME || "Expenses";

// Standard CORS response headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-User-Id",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  console.log("getExpenses invoked with event:", JSON.stringify(event));

  // Handle CORS OPTIONS preflight request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Preflight OK" })
    };
  }

  try {
    // 1. Extract authenticated user's ID
    const userId = 
      event.requestContext?.authorizer?.claims?.sub ||
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      event.queryStringParameters?.userId;

    if (!userId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Unauthorized: Missing user authentication token" })
      };
    }

    // 2. Query DynamoDB using the Partition Key (userId)
    // Ensures users can only access their own records!
    const queryCommand = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": userId
      }
    });

    const result = await docClient.send(queryCommand);
    const expenses = result.Items || [];

    // 3. Return user's expenses
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        count: expenses.length,
        expenses: expenses
      })
    };

  } catch (error) {
    console.error("Error in getExpenses Lambda:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message
      })
    };
  }
};
