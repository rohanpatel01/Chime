import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteItemCommand, DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb'
import { ApiGatewayManagementApi, GoneException } from "@aws-sdk/client-apigatewaymanagementapi"
import { TextEncoder } from "util";
import { disconnect, send } from "process";
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

var reactConnectionId: string = "";
var subUnitConnectionId: string[] = [];
var latestDeviceSent = "";


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

  console.log("device connected ", connectionId);

  latestDeviceSent = connectionId;

  if (reactConnectionId !== ""){
    console.log("possible esp connected: ", connectionId);
    console.log("current reactID: ", reactConnectionId);
    console.log("current sub units: ", subUnitConnectionId);
  } 

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

  // if (connectionId === reactConnectionId){ 
  //   console.log("removing react", reactConnectionId);
  //   reactConnectionId = "";

  // } //else if (subUnitConnectionId.indexOf(connectionId) != -1){ // remove sub unit connection ID
  //   console.log("before remove sub: ", subUnitConnectionId);
  //   subUnitConnectionId.splice(subUnitConnectionId.indexOf(connectionId) , 1);
  //   console.log("removed: ", connectionId);
  //   console.log("after removing sub", subUnitConnectionId);
  // }

  console.log("removing: ", connectionId);


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
  
  reactConnectionId = thisConnectionId;

  if (latestDeviceSent === thisConnectionId){
    latestDeviceSent = "";
  }

  var payload = JSON.parse(body);
  var payloadBody = payload.body || "no recipient"; // evaluate to no recipient if JSON doesn't have recipient

  // later make it so that you don't send out message recieved from front or esp to go through if only
  // one way communication to server
  // ex: when ESP pairs it shouldn't sent that to the front end but for testing it's ok
  if ( (latestDeviceSent != "") && (payload.body === "connectedESP") ){
    console.log("ESP Conncected: ", payload.body, "ConnectionID: ", latestDeviceSent);
  }
  
  console.log("body: ", body);
  console.log("payload: ", payload);
  console.log("payloadBody: ", payloadBody)
  console.log("react ID: ", thisConnectionId);
  
  const output = await dynamodbClient.send(
    new ScanCommand({
      TableName: clientsTable,
    }),
  );

  if (output.Count && output.Count > 0) {
    console.log("output items: ", output.Items);

    // create new array
    var currentDevicesConnected: string[] = [];

    for (const item of output.Items || []) {
      if (item["connectionId"].S !== thisConnectionId) {

        if ( (item["connectionId"].S as string) !== reactConnectionId ) {
          currentDevicesConnected.push(item["connectionId"].S as string);
        }

        sendMessage(item["connectionId"].S as string, body); // send message to all other connected devices
        // latestDeviceSent = item["connectionId"].S as string;
        console.log("sent to (ID): ", item["connectionId"].S);
        console.log("react ID: ", reactConnectionId);
        console.log("sent to all others");
      
      }
    }
    console.log("sent subunits: ", subUnitConnectionId);
    console.log("sent react: ", thisConnectionId);

    subUnitConnectionId = currentDevicesConnected;

    // send message to react front end of devices connecting 
    sendMessage( reactConnectionId,
      JSON.stringify({
        action: "msg",
        type: "status",
        body: {
          subUnitID: subUnitConnectionId,
          reactID: reactConnectionId,
        },
      })
    )

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