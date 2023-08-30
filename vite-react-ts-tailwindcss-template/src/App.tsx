import { useEffect, useState, useSyncExternalStore } from "react";
import "./App.css";
import useWebSocket from "react-use-websocket";
import TimeField from 'react-simple-timefield';

/*
TODO
1: send message to a specific client
2: display devices connected
3: have a way to select a device (to send alarm to in game)
4: for other things to signal game is over and such (have a mode to send message to all)
  - recipient = all
  - if recipient = all (in ws code) just send to all units

2: be able to specify which client you want to talk to
  - either mother client or a specific sub client (b/c that's what we're gonna do for the game)


  what if we leave an entry in esp32 pair command empty
  then as it passes through WS it gets filled when detected
    - issue with detecting the message however
*/


type MessageBody = {
  action: string;
  type: string;
  body: unknown;
};

const outputPins = [18]; // , 19, 22, 23
const defultOutputPin = outputPins[0];

let newDateTime;

function App() {
  const { lastMessage, sendMessage, readyState } = useWebSocket("wss://75kun89lml.execute-api.us-east-2.amazonaws.com/dev");
  const [selectedPin, setSelectedPin] = useState(defultOutputPin);
  const [pinValue, setPinValue] = useState(false);
  const [rawTime, setRawTime] = useState("00:00"); // default string for TimeField value
  
  // values processed by setAlarm function
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [isAm, setIsAm] = useState(true); // assume start with isAm (is the morning)

  const [ESP_Devices, setESP_Devices] = useState<number[]>([]);

  // read message recieved from esp about pinValue on requested pin
  // from esp > websocket > react
  useEffect(() => {
    if (lastMessage === null) { return; }

    const parsedMessage = JSON.parse(lastMessage.data) as MessageBody;

    if (parsedMessage.action !== "msg") { return; }

    // reading message recieved from esp to react front end
    // if (parsedMessage.type === "status"){
    //   console.log("react sent digital write, ESP response:", parsedMessage.body);
    // }

    if (parsedMessage.type === "connect"){
      // only set if esp not already added
      if (ESP_Devices.indexOf(parsedMessage.body as number) === -1 ){
        setESP_Devices([
          ...ESP_Devices,
          parsedMessage.body as number
        ])
      }
      
    }

    console.log("ESP Connected - mac index: ", parsedMessage.body);
    console.log("Connected Devices: ", ESP_Devices);



    // if (parsedMessage.type === "output") {
    //   const body = parsedMessage.body as number;
    //   setPinValue(body === 0 ? false : true);
    // }

  }, [lastMessage, setPinValue]);

  // setup commands for esp - requesting pin data via digital read and sending time
  // send digital read command

  // in body maybe put which esp you want to talk to or which connected device to talk to
  useEffect(() => {
    sendMessage(
      JSON.stringify({
        action: "msg",
        type: "cmd",
        body: {
          recipient: "mother",
          type: "digitalRead",
          pin: defultOutputPin,
        },
      })
    );

    // send dateTime
    getDateTime();
    // syncConnectionID(); // on first connect ask for connectionID from WS

    console.log("Send Pin Mode CMD");
    
    // send pinMode command to esp for each pin in list
    outputPins.forEach((pin) => {
      sendMessage(
        JSON.stringify({
          action: "msg",
          type: "cmd",
          body: {
            recipient: "mother",
            type: "pinMode",
            pin,
            mode: "output",
          },
        })
      );
    });

  }, []);

  // function syncConnectionID() {
    
  //   sendMessage(
  //     JSON.stringify({
  //       action: "msg",
  //       type: "sync",
  //       body: ""
  //     })
  //   );

  //   // every 60 seconds sync connectionID also make sure when you connect or disconnect 
  //   // you also send data from WS to react
  //   const syncConnectionIDTimeout = setTimeout(syncConnectionID, 60000);    
  // }

  function setAlarm(){
    const hourParsed = parseInt(rawTime.substring(0, 2), 10)
    const minuteParsed = parseInt(rawTime.substring(3), 10)
    setHour(hourParsed)
    setMinute(minuteParsed)
    console.log("set alarm")

    sendMessage(
      JSON.stringify({
        action: "msg",
        type: "info",
        body: {
          type: "alarmTime",
          bodyAlarmHour: hourParsed, // hourParsed
          bodyAlarmMinute: minuteParsed, // minuteParsed
        }
      })
    )

    getDateTime();
  }


  function addPeer() {
    console.log("Add peer");

    sendMessage(
      JSON.stringify({
        action: "msg",
        type: "info",
        body: {
          type: "addPeer",
        }
      })
    )

  }
  

  function getDateTime() {
    newDateTime = new Date();
    let dateTimeHour = newDateTime.getHours();
    let dateTimeMinute = newDateTime.getMinutes();

    // send hour and minute to esp
    sendMessage(
      JSON.stringify({
        action: "msg",
        type: "info",
        body: {
          recipient: "mother",
          type: "currentTime",
          bodyCurrentHour: dateTimeHour,
          bodyCurrentMinute: dateTimeMinute,
        }
      })
    )

    const getDateTimeTimeout = setTimeout(getDateTime, 60000);
  }

  return (
    <div className="App">
      <h1>ESP32 Control Panel</h1>

      <div>
        <h4>Set Alarm Time</h4>
        <TimeField 
          style={{ width: "100px" }} 
          onChange = { (event) => 
            setRawTime(event.target.value)
          } 
        />

        <h4>hour: {hour}</h4>
        <h4>minute: {minute}</h4>

        <div className="m-4">      
      
      </div>
        <button onClick={setAlarm}>Set Alarm</button>
      </div>

      <div>
        <button onClick={addPeer}>addPeer</button>
      </div>

      <div>
        <label className="block mb-2 text-base font-medium text-gray-900 dark:text-gray-400">
          Select a Pin
        </label>
        <select
          value={selectedPin}
          onChange={(e) => {
            const newPin = parseInt(e.target.value, 10);
            setSelectedPin(newPin);
            sendMessage(
              JSON.stringify({
                action: "msg",
                type: "cmd",
                body: {
                  recipient: "mother",
                  type: "digitalRead",
                  pin: newPin,
                },
              })
            );

            console.log("Send Digital Read");
          }}
          className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
        >
          {outputPins.map((pin, key) => (
            <option key={key} value={pin}>
              GPIO{pin}
            </option>
          ))}
        </select>
      </div>
      <div className="m-4">
        <label className="inline-flex relative items-center cursor-pointer">
          <input
            type="checkbox"
            checked={pinValue}
            onChange={() => {
              const newValue = !pinValue;

              setPinValue(newValue);
              sendMessage(
                JSON.stringify({
                  action: "msg",
                  type: "cmd",
                  body: {
                    type: "digitalWrite",
                    recipient: "mother",
                    pin: selectedPin,
                    value: newValue ? 1 : 0,
                  },
                })
              );

              console.log("Send Digital Write");
            }}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
            {pinValue ? "On" : "Off"}
          </span>
        </label>
      </div>
    </div>
  );
}

export default App;
