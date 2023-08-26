This is an IOT alarm clock. It has 3 modular units that act independently but communicate to a central websocket via the API gateway management API and to a React front end. 

This project is a work-in-project so some of the features based on web communication have not been implemented yet. 
The base features such as alarm detection, the game needed to turn off the alarm, the alarm sound, and pairing multiple devices are already complete.
Only the web communication between the React front end and the ESP32 microcontroller is currently in development.

I am using AWS to host my React front end, however, it is not hosted currently and I am using it locally for development.

The idea is that you along with your friends are able to access your alarm clock on the web. 
When your alarm goes off your friends are able to control the game that you have to play. 
The game involves you pressing the snooze button the each independent alarm module before your friends change which one you need to press.
To successfully beat the game you must beat your friends by successfully pressing the snooze button 6 times.
