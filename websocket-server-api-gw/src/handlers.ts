import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteItemCommand, DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb'
import { ApiGatewayManagementApi, GoneException } from "@aws-sdk/client-apigatewaymanagementapi"
import { TextEncoder } from "util";
import { send } from "process";
import { connect } from "http2";


const responseOK = {
  statusCode: 200,
  body: "",
};

const dynamodbClient = new DynamoDBClient({});
const apiGatewayManagementApi = new ApiGatewayManagementApi({
  endpoint: process.env["WSSAPIGATEWAYENDPOINT"],
})
const clientsTable = process.env["CLIENTS_TABLE_NAME"] || "";
const textEncoder = new TextEncoder();

var motherUnitConnectionId: string = "";
var subUnitConnectionId: string[] = [];

export const handle = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId as string;
  const routeKey = event.requestContext.routeKey as string;
  const body = event.body || "";

  switch (routeKey) {
    case "$connect":
      return handleConnect(connectionId);
    case "$disconnect":
      return handleDisconnect(connectionId);
    case "msg":
      return handleMsg(connectionId, body);
  }

  return responseOK; // changed
};


const handleConnect = async (connectionId: string): Promise<APIGatewayProxyResult> => {

  console.log("on connect");

  if (motherUnitConnectionId === ""){
    motherUnitConnectionId = connectionId;
    console.log("mother client");
    console.log(connectionId);
    
  } else {
    subUnitConnectionId.push(connectionId);
    console.log("sub unit client");
    console.log(connectionId);
  }

  console.log(motherUnitConnectionId);
  console.log(subUnitConnectionId);

   
  await dynamodbClient.send(
    new PutItemCommand({
      TableName: clientsTable,
      Item: {
        connectionId: {
          S: connectionId,
        },
      },
    }),
  );

  // was send date time but handle this with react front end
  console.log(connectionId);

  return responseOK;
}

const handleDisconnect = async (connectionId: string): Promise<APIGatewayProxyResult> => {

  console.log("before disconnect");
  console.log("mother", motherUnitConnectionId);
  console.log("sub unit", subUnitConnectionId);

  // remove who connected from out list
  if (connectionId === motherUnitConnectionId){ // if mother is removed also remove all others?
    console.log("removing mother", connectionId);
    motherUnitConnectionId = "";

  } else if (subUnitConnectionId.indexOf(connectionId) != -1){ // remove sub unit connection ID
    subUnitConnectionId.splice(subUnitConnectionId.indexOf(connectionId) , 1);
    console.log("removing sub", connectionId);
  }

  console.log("after disconnect");
  console.log("mother", motherUnitConnectionId);
  console.log("sub unit", subUnitConnectionId);


  await dynamodbClient.send(
    new DeleteItemCommand({
      TableName: clientsTable,
      Key: {
        connectionId: {
          S: connectionId,
        },
      },
    }),
  );
  
  console.log("disconnected :(");
  return responseOK;

};

const handleMsg = async (thisConnectionId: string, body: string): Promise<APIGatewayProxyResult> => {
  const output = await dynamodbClient.send(
    new ScanCommand({
      TableName: clientsTable,
    }),
  );

  if (output.Count && output.Count > 0) {
    console.log("output items: ", output.Items);

    for (const item of output.Items || []) {
      if (item["connectionId"].S !== thisConnectionId) {
        sendMessage(item["connectionId"].S as string, body); // send message to all other connected devices
        // console.log("sent message");
      }
    }

  } else {
    await sendMessage(thisConnectionId, JSON.stringify({ action: "msg", type: "warning", body: "no recipient" }));
  }

  return responseOK;
};

const sendMessage = async (connectionId: string, body: string) => {
  try{
    await apiGatewayManagementApi.postToConnection({
      ConnectionId: connectionId,
      Data: textEncoder.encode(body),
    });
  } catch (e) {
    if (e instanceof GoneException) {
      await handleDisconnect(connectionId);
      return;
    }

    throw e;
  }
};
