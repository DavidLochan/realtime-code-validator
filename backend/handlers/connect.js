const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.CONNECTIONS_TABLE;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('CONNECT received. connectionId =', connectionId, 'TABLE =', TABLE);

  try {
    await ddb.put({
      TableName: TABLE,
      Item: {
        connectionId,
        connectedAt: Date.now()
      }
    }).promise();

    return {
      statusCode: 200,
      body: 'Connected.'
    };
  } catch (err) {
    console.error('Error in $connect handler:', err);
    return {
      statusCode: 500,
      body: 'Failed to connect'
    };
  }
};
