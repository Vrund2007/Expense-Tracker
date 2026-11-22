/**
 * Automated AWS Serverless Deployment Script
 * Deploys DynamoDB, IAM Role, Lambdas, Cognito User Pool & Client, API Gateway, and configures frontend.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Ensure AWS CLI in PATH
const awsCliPath = "C:\\Program Files\\Amazon\\AWSCLIV2";
if (fs.existsSync(awsCliPath) && !process.env.PATH.includes(awsCliPath)) {
  process.env.PATH = `${awsCliPath};${process.env.PATH}`;
}

function run(cmd, ignoreError = false) {
  console.log(`\n> ${cmd}`);
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: process.env });
    return out.trim();
  } catch (err) {
    if (!ignoreError) {
      console.error(`ERROR running command: ${cmd}`);
      if (err.stdout) console.error("STDOUT:", err.stdout);
      if (err.stderr) console.error("STDERR:", err.stderr);
      throw err;
    }
    return null;
  }
}

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  console.log("=================================================");
  console.log("   AUTOMATED AWS EXPENSE TRACKER DEPLOYMENT      ");
  console.log("=================================================");

  // 1. Verify AWS CLI & Caller Identity
  console.log("\n[1/7] Verifying AWS Credentials...");
  let callerInfo;
  try {
    const rawCaller = run("aws sts get-caller-identity --output json");
    callerInfo = JSON.parse(rawCaller);
    console.log(`Connected to AWS as: ${callerInfo.Arn} (Account: ${callerInfo.Account})`);
  } catch (e) {
    console.error("\n❌ AWS credentials not found or invalid!");
    console.error("Please run: aws login");
    process.exit(1);
  }

  // Detect Region from AWS CLI
  let region = run("aws configure get region", true) || "ap-southeast-2";
  console.log(`Target AWS Region: ${region}`);

  // 2. DynamoDB Table
  console.log("\n[2/7] Checking / Creating DynamoDB Table: Expenses...");
  const tableCheck = run(`aws dynamodb describe-table --table-name Expenses --region ${region} --output json`, true);
  if (!tableCheck) {
    console.log("Creating DynamoDB table 'Expenses'...");
    run(`aws dynamodb create-table ` +
      `--table-name Expenses ` +
      `--attribute-definitions AttributeName=userId,AttributeType=S AttributeName=expenseId,AttributeType=S ` +
      `--key-schema AttributeName=userId,KeyType=HASH AttributeName=expenseId,KeyType=RANGE ` +
      `--billing-mode PAY_PER_REQUEST ` +
      `--region ${region}`);
    console.log("Waiting for DynamoDB table to become ACTIVE...");
    run(`aws dynamodb wait table-exists --table-name Expenses --region ${region}`);
    console.log("✔ DynamoDB table is ACTIVE.");
  } else {
    console.log("✔ DynamoDB table 'Expenses' already exists.");
  }

  // 3. IAM Role for Lambda
  console.log("\n[3/7] Setting up IAM Role: ExpenseTrackerLambdaRole...");
  const roleName = "ExpenseTrackerLambdaRole";
  let roleArn = "";
  const roleCheck = run(`aws iam get-role --role-name ${roleName} --output json`, true);
  
  if (!roleCheck) {
    console.log(`Creating IAM role: ${roleName}...`);
    const trustPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole"
      }]
    });
    const trustPath = path.join(__dirname, "trust-policy.json");
    fs.writeFileSync(trustPath, trustPolicy);

    const createdRoleRaw = run(`aws iam create-role --role-name ${roleName} --assume-role-policy-document "file://${trustPath}" --output json`);
    roleArn = JSON.parse(createdRoleRaw).Role.Arn;

    // Attach basic execution
    run(`aws iam attach-role-policy --role-name ${roleName} --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`);

    // Attach DynamoDB policy
    const ddbPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Sid: "DynamoDBExpenseAccess",
        Effect: "Allow",
        Action: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:DeleteItem"],
        Resource: `arn:aws:dynamodb:${region}:${callerInfo.Account}:table/Expenses`
      }]
    });
    const ddbPath = path.join(__dirname, "ddb-policy.json");
    fs.writeFileSync(ddbPath, ddbPolicy);
    run(`aws iam put-role-policy --role-name ${roleName} --policy-name ExpenseTrackerDynamoDBPolicy --policy-document "file://${ddbPath}"`);

    console.log("Waiting 10s for IAM role to propagate across AWS...");
    await sleep(10000);
  } else {
    roleArn = JSON.parse(roleCheck).Role.Arn;
    console.log(`✔ IAM role exists: ${roleArn}`);
  }

  // 4. Package & Deploy Lambda Functions
  console.log("\n[4/7] Packaging and Deploying Lambda Functions...");
  const functions = [
    { name: "addExpense", dir: "backend/addExpense" },
    { name: "getExpenses", dir: "backend/getExpenses" },
    { name: "deleteExpense", dir: "backend/deleteExpense" }
  ];

  const lambdaArns = {};

  for (const fn of functions) {
    const zipPath = path.join(__dirname, `${fn.name}.zip`);
    const sourceFile = path.join(__dirname, fn.dir, "index.js");

    // PowerShell Compress-Archive command
    run(`powershell -Command "Compress-Archive -Path '${sourceFile}' -DestinationPath '${zipPath}' -Force"`);

    const fnCheck = run(`aws lambda get-function --function-name ${fn.name} --region ${region} --output json`, true);
    if (!fnCheck) {
      console.log(`Creating Lambda function: ${fn.name}...`);
      const createOut = run(`aws lambda create-function ` +
        `--function-name ${fn.name} ` +
        `--runtime nodejs20.x ` +
        `--role ${roleArn} ` +
        `--handler index.handler ` +
        `--zip-file "fileb://${zipPath}" ` +
        `--environment Variables="{TABLE_NAME=Expenses}" ` +
        `--region ${region} --output json`);
      lambdaArns[fn.name] = JSON.parse(createOut).FunctionArn;
    } else {
      console.log(`Updating existing Lambda code: ${fn.name}...`);
      const updateOut = run(`aws lambda update-function-code ` +
        `--function-name ${fn.name} ` +
        `--zip-file "fileb://${zipPath}" ` +
        `--region ${region} --output json`);
      lambdaArns[fn.name] = JSON.parse(updateOut).FunctionArn;
    }
    console.log(`✔ Lambda ${fn.name} ready.`);
  }

  // 5. Amazon Cognito Setup
  console.log("\n[5/7] Setting up Amazon Cognito User Pool...");
  let userPoolId = "";
  let clientId = "";

  const poolListRaw = run(`aws cognito-idp list-user-pools --max-results 20 --region ${region} --output json`);
  const pools = JSON.parse(poolListRaw).UserPools || [];
  const existingPool = pools.find(p => p.Name === "ExpenseTrackerUserPool");

  if (existingPool) {
    userPoolId = existingPool.Id;
    console.log(`✔ Found existing Cognito User Pool: ${userPoolId}`);
  } else {
    console.log("Creating new Cognito User Pool: ExpenseTrackerUserPool...");
    const policiesJson = JSON.stringify({
      PasswordPolicy: {
        MinimumLength: 8,
        RequireUppercase: true,
        RequireLowercase: true,
        RequireNumbers: true,
        RequireSymbols: false
      }
    });
    const policiesPath = path.join(__dirname, "cognito-policies.json");
    fs.writeFileSync(policiesPath, policiesJson);

    const createPoolRaw = run(`aws cognito-idp create-user-pool ` +
      `--pool-name ExpenseTrackerUserPool ` +
      `--username-attributes email ` +
      `--auto-verified-attributes email ` +
      `--policies "file://${policiesPath}" ` +
      `--region ${region} --output json`);
    userPoolId = JSON.parse(createPoolRaw).UserPool.Id;
    console.log(`✔ Created User Pool: ${userPoolId}`);
  }

  // App Client
  const clientListRaw = run(`aws cognito-idp list-user-pool-clients --user-pool-id ${userPoolId} --region ${region} --output json`);
  const clients = JSON.parse(clientListRaw).UserPoolClients || [];
  const existingClient = clients.find(c => c.ClientName === "ExpenseTrackerWebClient");

  if (existingClient) {
    clientId = existingClient.ClientId;
    console.log(`✔ Found existing App Client ID: ${clientId}`);
  } else {
    console.log("Creating App Client with ALLOW_USER_PASSWORD_AUTH...");
    const createClientRaw = run(`aws cognito-idp create-user-pool-client ` +
      `--user-pool-id ${userPoolId} ` +
      `--client-name ExpenseTrackerWebClient ` +
      `--no-generate-secret ` +
      `--explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ` +
      `--region ${region} --output json`);
    clientId = JSON.parse(createClientRaw).UserPoolClient.ClientId;
    console.log(`✔ Created App Client ID: ${clientId}`);
  }

  // 6. Amazon API Gateway
  console.log("\n[6/7] Setting up Amazon API Gateway REST API...");
  let restApiId = "";
  const apisRaw = run(`aws apigateway get-rest-apis --region ${region} --output json`);
  const apis = JSON.parse(apisRaw).items || [];
  const existingApi = apis.find(a => a.name === "ExpenseTrackerAPI");

  if (existingApi) {
    restApiId = existingApi.id;
    console.log(`✔ Found existing REST API: ${restApiId}`);
  } else {
    console.log("Creating REST API: ExpenseTrackerAPI...");
    const createApiRaw = run(`aws apigateway create-rest-api --name ExpenseTrackerAPI --endpoint-configuration types=REGIONAL --region ${region} --output json`);
    restApiId = JSON.parse(createApiRaw).id;
  }

  // Authorizer
  const authorizersRaw = run(`aws apigateway get-authorizers --rest-api-id ${restApiId} --region ${region} --output json`);
  const authorizers = JSON.parse(authorizersRaw).items || [];
  let authorizerId = "";
  const existingAuth = authorizers.find(a => a.name === "CognitoAuth");
  if (existingAuth) {
    authorizerId = existingAuth.id;
  } else {
    console.log("Creating Cognito Authorizer on API Gateway...");
    const userPoolArn = `arn:aws:cognito-idp:${region}:${callerInfo.Account}:userpool/${userPoolId}`;
    const createAuthRaw = run(`aws apigateway create-authorizer ` +
      `--rest-api-id ${restApiId} ` +
      `--name CognitoAuth ` +
      `--type COGNITO_USER_POOLS ` +
      `--provider-arns ${userPoolArn} ` +
      `--identity-source method.request.header.Authorization ` +
      `--region ${region} --output json`);
    authorizerId = JSON.parse(createAuthRaw).id;
  }

  // Resources
  const resourcesRaw = run(`aws apigateway get-resources --rest-api-id ${restApiId} --region ${region} --output json`);
  const resources = JSON.parse(resourcesRaw).items || [];
  const rootResource = resources.find(r => r.path === "/");
  const rootId = rootResource.id;

  let expensesRes = resources.find(r => r.path === "/expenses");
  let expensesResId = expensesRes?.id;
  if (!expensesResId) {
    console.log("Creating /expenses resource...");
    const resRaw = run(`aws apigateway create-resource --rest-api-id ${restApiId} --parent-id ${rootId} --path-part expenses --region ${region} --output json`);
    expensesResId = JSON.parse(resRaw).id;
  }

  let idRes = resources.find(r => r.path === "/expenses/{id}");
  let idResId = idRes?.id;
  if (!idResId) {
    console.log("Creating /expenses/{id} resource...");
    const resRaw = run(`aws apigateway create-resource --rest-api-id ${restApiId} --parent-id ${expensesResId} --path-part "{id}" --region ${region} --output json`);
    idResId = JSON.parse(resRaw).id;
  }

  // Setup methods
  function setupMethod(resId, httpMethod, lambdaName) {
    console.log(`Setting up ${httpMethod} method for ${lambdaName}...`);
    // Put Method
    run(`aws apigateway put-method ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method ${httpMethod} ` +
      `--authorization-type COGNITO_USER_POOLS ` +
      `--authorizer-id ${authorizerId} ` +
      `--region ${region}`, true);

    // Put Integration
    const lambdaUri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${region}:${callerInfo.Account}:function:${lambdaName}/invocations`;
    run(`aws apigateway put-integration ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method ${httpMethod} ` +
      `--type AWS_PROXY ` +
      `--integration-http-method POST ` +
      `--uri "${lambdaUri}" ` +
      `--region ${region}`, true);

    // Lambda Permission for API Gateway invocation
    const statementId = `apigateway-${lambdaName}-${httpMethod}-${Date.now().toString(36)}`;
    run(`aws lambda add-permission ` +
      `--function-name ${lambdaName} ` +
      `--statement-id ${statementId} ` +
      `--action lambda:InvokeFunction ` +
      `--principal apigateway.amazonaws.com ` +
      `--source-arn "arn:aws:execute-api:${region}:${callerInfo.Account}:${restApiId}/*/${httpMethod}/*" ` +
      `--region ${region}`, true);
  }

  function setupCors(resId) {
    console.log(`Setting up CORS OPTIONS on resource ${resId}...`);
    run(`aws apigateway put-method ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method OPTIONS ` +
      `--authorization-type NONE ` +
      `--region ${region}`, true);

    run(`aws apigateway put-integration ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method OPTIONS ` +
      `--type MOCK ` +
      `--request-templates "{\\"application/json\\":\\"{\\\\\\"statusCode\\\\\\":200}\\"}" ` +
      `--region ${region}`, true);

    run(`aws apigateway put-method-response ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method OPTIONS ` +
      `--status-code 200 ` +
      `--response-parameters "method.response.header.Access-Control-Allow-Headers=true,method.response.header.Access-Control-Allow-Methods=true,method.response.header.Access-Control-Allow-Origin=true" ` +
      `--region ${region}`, true);

    run(`aws apigateway put-integration-response ` +
      `--rest-api-id ${restApiId} ` +
      `--resource-id ${resId} ` +
      `--http-method OPTIONS ` +
      `--status-code 200 ` +
      `--response-parameters "{\\"method.response.header.Access-Control-Allow-Headers\\":\\"'Content-Type,Authorization,X-User-Id'\\",\\"method.response.header.Access-Control-Allow-Methods\\":\\"'OPTIONS,POST,GET,DELETE'\\",\\"method.response.header.Access-Control-Allow-Origin\\":\\"'*'\\"}" ` +
      `--region ${region}`, true);
  }

  setupMethod(expensesResId, "POST", "addExpense");
  setupMethod(expensesResId, "GET", "getExpenses");
  setupMethod(idResId, "DELETE", "deleteExpense");

  setupCors(expensesResId);
  setupCors(idResId);

  // Deploy API
  console.log("Deploying API Gateway stage: prod...");
  run(`aws apigateway create-deployment --rest-api-id ${restApiId} --stage-name prod --region ${region}`, true);

  const apiBaseUrl = `https://${restApiId}.execute-api.${region}.amazonaws.com/prod`;
  console.log(`✔ API Gateway Invoke URL: ${apiBaseUrl}`);

  // 7. Update Frontend script.js
  console.log("\n[7/7] Updating frontend/script.js with AWS endpoints...");
  const scriptPath = path.join(__dirname, "frontend", "script.js");
  let scriptContent = fs.readFileSync(scriptPath, "utf8");

  const newConfigBlock = `const AWS_CONFIG = {
  // Amazon API Gateway Invoke URL
  apiBaseUrl: "${apiBaseUrl}",

  // Amazon Cognito User Pool configuration
  cognito: {
    region: "${region}",
    userPoolId: "${userPoolId}",
    clientId: "${clientId}"
  }
};`;

  scriptContent = scriptContent.replace(/const AWS_CONFIG = \{[\s\S]*?\n\};/, newConfigBlock);
  fs.writeFileSync(scriptPath, scriptContent);

  // Also update expense-tracker/frontend/script.js if exists
  const mirrorPath = path.join(__dirname, "expense-tracker", "frontend", "script.js");
  if (fs.existsSync(mirrorPath)) {
    fs.writeFileSync(mirrorPath, scriptContent);
  }

  console.log("=================================================");
  console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
  console.log("=================================================");
  console.log(`Region:           ${region}`);
  console.log(`DynamoDB Table:   Expenses`);
  console.log(`Cognito Pool:     ${userPoolId}`);
  console.log(`Cognito Client:   ${clientId}`);
  console.log(`API Gateway URL:  ${apiBaseUrl}`);
  console.log("\nYour frontend has been automatically configured!");
  console.log("You can now open frontend/index.html to use your live AWS Cloud app!");
}

main().catch(err => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
