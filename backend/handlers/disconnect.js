const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.CONNECTIONS_TABLE;

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('DISCONNECT received. connectionId =', connectionId, 'TABLE =', TABLE);

  try {
    await ddb.delete({
      TableName: TABLE,
      Key: { connectionId }
    }).promise();

    return {
      statusCode: 200,
      body: 'Disconnected.'
    };
  } catch (err) {
    console.error('Error in $disconnect handler:', err);
    return {
      statusCode: 500,
      body: 'Failed to disconnect'
    };
  }
};
