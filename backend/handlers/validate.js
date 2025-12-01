// backend/handlers/validate.js
const AWS = require("aws-sdk");
const acorn = require("acorn");

const lambda = new AWS.Lambda();
const PYTHON_VALIDATOR_FN = process.env.PYTHON_VALIDATOR_FN;

// Build ApiGatewayManagementApi from the event (no env var dependency)
function getApiGatewayClient(event) {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  return new AWS.ApiGatewayManagementApi({
    endpoint: `${domain}/${stage}`,
  });
}

async function sendToConnection(event, connectionId, payload) {
  const apiGw = getApiGatewayClient(event);
  await apiGw
    .postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(payload),
    })
    .promise();
}

// Very simple JS syntax validator using Function constructor
// JavaScript syntax validator using Acorn with locations
function validateJavaScript(code) {
  try {
    acorn.parse(code, {
      ecmaVersion: "latest",
      locations: true, // gives us line + column
      sourceType: "script",
    });
    return { ok: true, errors: [] };
  } catch (err) {
    const loc = err.loc || {};
    return {
      ok: false,
      errors: [
        {
          message: err.message || "Syntax error",
          loc: {
            line: loc.line ?? null,             // acorn line is 1-based
            column: loc.column != null ? loc.column + 1 : null, // acorn column is 0-based → make it 1-based
          },
        },
      ],
    };
  }
}


exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId || "";
  let language = "javascript";

  try {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      await sendToConnection(event, connectionId, {
        type: "validationResult",
        requestId: "",
        language: "unknown",
        result: {
          ok: false,
          errors: [
            {
              message: "Invalid JSON in request",
              loc: {},
            },
          ],
        },
      });
      return { statusCode: 400 };
    }

    language = (body.language || "javascript").toLowerCase();
    const code = body.code || "";
    const requestId = body.requestId || Date.now().toString();

    // ---------- PYTHON BRANCH ----------
    if (language === "python") {
      try {
        const invokeRes = await lambda
          .invoke({
            FunctionName: PYTHON_VALIDATOR_FN,
            Payload: JSON.stringify({
              body: JSON.stringify({ code, requestId }),
            }),
          })
          .promise();

        let payload;
        try {
          payload = JSON.parse(invokeRes.Payload || "{}");
        } catch {
          payload = {};
        }

        let bodyObj;
        try {
          bodyObj =
            typeof payload.body === "string"
              ? JSON.parse(payload.body)
              : payload.body || {};
        } catch {
          bodyObj = {};
        }

        const finalResult =
          bodyObj.result ||
          (bodyObj.body && bodyObj.body.result) ||
          null;

        await sendToConnection(event, connectionId, {
          type: "validationResult",
          requestId: bodyObj.requestId || requestId,
          language: "python",
          result:
            finalResult || {
              ok: false,
              errors: [
                {
                  message: "Python validator returned no result",
                  loc: {},
                },
              ],
            },
        });
      } catch (err) {
        console.error("Python validator error", err);
        await sendToConnection(event, connectionId, {
          type: "validationResult",
          requestId,
          language: "python",
          result: {
            ok: false,
            errors: [
              {
                message: "Internal error while validating Python code",
                loc: {},
              },
            ],
          },
        });
      }

      return { statusCode: 200 };
    }

    // ---------- JAVASCRIPT BRANCH (default) ----------
    const jsResult = validateJavaScript(code);

    await sendToConnection(event, connectionId, {
      type: "validationResult",
      requestId,
      language: "javascript",
      result: jsResult,
    });

    return { statusCode: 200 };
  } catch (err) {
    console.error("validate handler fatal error", err);
    // best effort: try to notify client
    try {
      if (connectionId) {
        await sendToConnection(event, connectionId, {
          type: "validationResult",
          requestId: "",
          language,
          result: {
            ok: false,
            errors: [
              {
                message: "Internal error in validator function",
                loc: {},
              },
            ],
          },
        });
      }
    } catch (e2) {
      console.error("Failed to send error to connection", e2);
    }
    return { statusCode: 500 };
  }
};
