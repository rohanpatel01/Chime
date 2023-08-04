/*
  TODO:
  - test current and alarm AM/PM
  - send back the value that the esp has for alarm rather than the one sent just to be sure
*/


#include <Arduino.h>
#include <WebSocketsClient.h>
#include <WiFiMulti.h>

#include <ArduinoJson.h>

#define WIFI_SSID "MRK"
#define WIFI_PASSWORD "MRK9004#"

#define WS_HOST "75kun89lml.execute-api.us-east-2.amazonaws.com"
#define WS_PORT 443
#define WS_URL "/dev"

#define JSON_DOC_SIZE 2048
#define MSG_SIZE 256

WiFiMulti wifiMulti;
WebSocketsClient wsClient;

// variables for keeping local time and alarm time
// default to 999 so alarm doesn't go off early
uint8_t currentHour = 999;
uint8_t currentMinute = 999;
bool isCurrentAm = false;

uint8_t alarmHour = 0;
uint8_t alarmMinute = 0;
bool isAlarmAm = false;

void alarm() {
  if ( (currentHour == alarmHour) && (currentMinute == alarmMinute) && (isCurrentAm == isAlarmAm)) {
    Serial.println("Alarm!!!");
  }

}

void sendErrorMessage(const char *error) {
  char msg[MSG_SIZE];

  sprintf(msg, "{\"action\":\"msg\",\"type\":\"error\",\"body\":\"%s\"}",
          error);

  wsClient.sendTXT(msg);
}

void sendOkMessage() {
  wsClient.sendTXT("{\"action\":\"msg\",\"type\":\"status\",\"body\":\"ok\"}");
}

uint8_t toMode(const char *val) {
  if (strcmp(val, "output") == 0) {
    return OUTPUT;
  }

  if (strcmp(val, "input_pullup") == 0) {
    return INPUT_PULLUP;
  }

  return INPUT;
}

void handleMessage(uint8_t *payload) {
  StaticJsonDocument<JSON_DOC_SIZE> doc;

  DeserializationError error = deserializeJson(doc, payload);

  // Test if parsing succeeds.
  if (error) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(error.f_str());
    sendErrorMessage(error.c_str());
    return;
  }

  if (!doc["type"].is<const char *>()) {
    sendErrorMessage("invalid message type format");
    return;
  }
 
  // process current time and alarm time
  if (strcmp(doc["type"], "info") == 0) {                      // set current time for display
    if (strcmp(doc["body"]["type"], "currentTime") == 0) {
      JsonObject timeDoc = doc["body"];
      long hour = timeDoc["bodyCurrentHour"];
      long minute = timeDoc["bodyCurrentMinute"];
      currentMinute = minute;

      if (hour > 12) { 
        isCurrentAm = false;
        currentHour = (hour - 12); // need to convert hour so not in milirary time
        
      } else if (hour >= 12) {
        isCurrentAm = false; // time is PM if 12 or later during day
        currentHour = hour; 
      } else {
        isCurrentAm = true; // hour is before 12 thus in the am
        currentHour = hour; 
      }

      Serial.println("isCurrentAm");
      Serial.println(isCurrentAm);

    } else if (strcmp(doc["body"]["type"], "alarmTime") == 0) {   // set alarm time for alarm
      JsonObject timeDoc = doc["body"];
      long hour = timeDoc["bodyAlarmHour"];
      long minute = timeDoc["bodyAlarmMinute"];
      alarmMinute = minute;

      if (hour > 12) { 
        isAlarmAm = false;
        alarmHour = (hour - 12);

      } else if (hour >= 12) {
        isAlarmAm = false;
        alarmHour = hour;
      } else {
        isAlarmAm = true;
        alarmHour = hour;
      }
    
      Serial.println("isAlarmAm");
      Serial.println(isAlarmAm);

    } 
  }

  if (strcmp(doc["type"], "cmd") == 0) {
    if (!doc["body"].is<JsonObject>()) {
      sendErrorMessage("invalid command body");
      return;
    }

    if (strcmp(doc["body"]["type"], "pinMode") == 0) {
      // comment here was for better validation for pin mode - just visit his repo if need this
      pinMode(doc["body"]["pin"], toMode(doc["body"]["mode"]));
      sendOkMessage();
      return;
    }

    if (strcmp(doc["body"]["type"], "digitalWrite") == 0) {
      digitalWrite(doc["body"]["pin"], doc["body"]["value"]);
      sendOkMessage();
      return;
    }

    if (strcmp(doc["body"]["type"], "digitalRead") == 0) {
      auto value = digitalRead(doc["body"]["pin"]);

      char msg[MSG_SIZE];

      sprintf(msg, "{\"action\":\"msg\",\"type\":\"output\",\"body\":%d}",
              value);

      wsClient.sendTXT(msg);
      return;
    }

    sendErrorMessage("unsupported command type");
    return;
  }

  sendErrorMessage("unsupported message type");
  return;
}

void onWSEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_CONNECTED:
    Serial.println("WS Connected");
    break;
  case WStype_DISCONNECTED:
    Serial.println("WS Disconnected");
    break;
  case WStype_TEXT:
    Serial.printf("WS Message: %s\n", payload);

    handleMessage(payload);

    break;
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);

  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(100);
  }

  Serial.println("Connected");

  wsClient.beginSSL(WS_HOST, WS_PORT, WS_URL, "", "wss");
  wsClient.onEvent(onWSEvent);
}

void loop() {
  digitalWrite(LED_BUILTIN, WiFi.status() == WL_CONNECTED);
  wsClient.loop();

  alarm();

}