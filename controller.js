//------------------------------------------------------------------------------
// Copyright IBM Corp. 2016
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//------------------------------------------------------------------------------

var config = require('./config-wrapper.js')();
var async = require('async');
var noble = require('noble');
var mqtt = require('mqtt');
var readline = require('readline');
var bodyParser = require('body-parser');

var receivedMessages = require('./receivedMessages.js')();
var prepareMessages = require('./prepareMessages.js')();



var readCharacteristic;
var writeCharacteristic;
var cars = [];
var lane;

const express = require('express')
const app = express()

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing 

function carInfo(peripheral){
  return function (req, res, next) {
    console.log('LOGGED')
    let carData = {
      address: peripheral.id,
      battery: 1,
      version: 2,
    };
    res.send(carData);
    next()
  }
}

function carControl(peripheral, writeCharacteristic){
  function invokeCommand(cmd) {
    var message = prepareMessages.format(cmd);
    if (message) {                     
      console.log("Command: " + cmd, message);
              
      if (writeCharacteristic) { 
        writeCharacteristic.write(message, false, function(err) {
          if (!err) {
            //console.log('Command sent');
          }
          else {
            console.log('Error sending command');
          }
        });
      } else {
        console.log('Error sending command');
      }
    }
  }

  function invokeCommand(cmd) {
    var message = prepareMessages.format(cmd);
    if (message) {                     
      console.log("Command: " + cmd, message);
              
      if (writeCharacteristic) { 
        writeCharacteristic.write(message, false, function(err) {
          if (!err) {
            //console.log('Command sent');
          }
          else {
            console.log('Error sending command');
          }
        });
      } else {
        console.log('Error sending command');
      }
    }
  }

  return function (req, res, next) {
    console.log('Got your data' )
    res.send(JSON.stringify(req.body));
    if(req.body.command){
      invokeCommand(req.body.command);
    }
    next()
  }
}



app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})

var carIds = [
  "1dccd1656f9f4751807331d3f261c17a",
  "cf825d8fe855403fa8d17005ce3efc5a"
]

config.read(process.argv[2], function(carId, startlane, mqttClient) {

  if (!carId) {
    console.log('Define carid in a properties file and pass in the name of the file as argv');
    process.exit(0);
  }
  lane = startlane;

  noble.startScanning();
  setTimeout(function() {
    noble.stopScanning();
  }, 2000);

  noble.on('discover', function(peripheral) {
    let carId = carIds.indexOf(peripheral.id);
    console.log(carId)
    if (carId >= 0)  {
      // noble.stopScanning();

      var advertisement = peripheral.advertisement;
      var serviceUuids = JSON.stringify(peripheral.advertisement.serviceUuids);
      if(serviceUuids.indexOf("be15beef6186407e83810bd89c4d8df4") > -1) {
        console.log('Car discovered. ID: ' + peripheral.id); 
        let car = cars[carId] = peripheral;
        // console.log(cars);
        setUp(car, carId);
      }
    }
  });

  function setUp(peripheral, id) {
    peripheral.on('disconnect', function() {
      console.log('Car has been disconnected');
      process.exit(0);
    });

    peripheral.connect(function(error) {
      peripheral.discoverServices([], function(error, services) {
        var service = services[0];
        
        service.discoverCharacteristics([], function(error, characteristics) {
          var characteristicIndex = 0;

          async.whilst(
            function () {
              return (characteristicIndex < characteristics.length);
            },
            function(callback) {
              var characteristic = characteristics[characteristicIndex];
              async.series([
                function(callback) {
                  if (characteristic.uuid == 'be15bee06186407e83810bd89c4d8df4') {
                    readCharacteristic = characteristic;

                    readCharacteristic.notify(true, function(err) {
                    });

                    characteristic.on('read', function(data, isNotification) {
                      receivedMessages.handle(data, mqttClient);
                    });
                  }

                  if (characteristic.uuid == 'be15bee16186407e83810bd89c4d8df4') {                        
                    writeCharacteristic = characteristic;
                    app.get('/' + id, carInfo(peripheral));
                    app.post('/' + id, carControl(peripheral, writeCharacteristic));
                    console.log("route opened for", '/' + id);
                    init(startlane); 

                    // this characterstic doesn't seem to be used for receiving data
                    characteristic.on('read', function(data, isNotification) {
                      console.log('Data received - writeCharacteristic', data);
                    });                          
                  }

                  callback();
                },
                function() {
                  characteristicIndex++;
                  callback();
                }
              ]);
            },
            function(error) {
            }
          );
        });
      });
    });
  }

  mqttClient.on('error', function(err) {
    console.error('MQTT client error ' + err);
    mqttClient = null;
  });
  mqttClient.on('close', function() {
    console.log('MQTT client closed');
    mqttClient = null;
  });

  mqttClient.on('message', function(topic, message, packet) {
    var msg = JSON.parse(message.toString());
    //console.log('Message received from Bluemix');
    
    if (msg.d.action == '#s') {
      var cmd = "s";
      if (msg.d.speed) {
        cmd = cmd + " " + msg.d.speed;
        if (msg.d.accel) {
          cmd = cmd + " " + msg.d.accel;
        }
      }
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#c') {
      var cmd = "c";
      if (msg.d.offset) {
        cmd = cmd + " " + msg.d.offset;
      }
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#q') {
      var cmd = "q";
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#ping') {
      var cmd = "ping";
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#ver') {
      var cmd = "ver";
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#bat') {
      var cmd = "bat";
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#l') {
      var cmd = "l";
      invokeCommand(cmd);
    }
    else if (msg.d.action == '#lp') {
      var cmd = "lp";
      invokeCommand(cmd);
    }
  });
});

function init(startlane) {
  // turn on sdk and set offset
  var initMessage = new Buffer(4);
  initMessage.writeUInt8(0x03, 0);
  initMessage.writeUInt8(0x90, 1);
  initMessage.writeUInt8(0x01, 2);
  initMessage.writeUInt8(0x01, 3);
  writeCharacteristic.write(initMessage, false, function(err) {
    if (!err) {
      var initialOffset = 0.0;
      if (startlane) {
        if (startlane == '1') initialOffset = 68.0;
        if (startlane == '2') initialOffset = 23.0;
        if (startlane == '3') initialOffset = -23.0;
        if (startlane == '4') initialOffset = -68.0;
      }

      initMessage = new Buffer(6);
      initMessage.writeUInt8(0x05, 0);
      initMessage.writeUInt8(0x2c, 1);
      initMessage.writeFloatLE(initialOffset, 2);
      writeCharacteristic.write(initMessage, false, function(err) {
        if (!err) {
          console.log('Initialization was successful');
          console.log('Enter a command: help, s (speed), c (change lane), e (end/stop), l (lights), lp (lights pattern), o (offset), sdk, ping, bat, ver, q (quit)');
        }
        else {
          console.log('Initialization error');
        }
      });      
    }
    else {
      console.log('Initialization error');
    }
  });
}

function invokeCommand(cmd) {
  var message = prepareMessages.format(cmd);
  if (message) {                     
    console.log("Command: " + cmd, message);
             
    if (writeCharacteristic) { 
      writeCharacteristic.write(message, false, function(err) {
        if (!err) {
          //console.log('Command sent');
        }
        else {
          console.log('Error sending command');
        }
      });
    } else {
      console.log('Error sending command');
    }
  }
}

var cli = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

cli.on('line', function (cmd) {
  if (cmd == "help") {
    console.log(prepareMessages.doc());
  } 
  else {
    invokeCommand(cmd);
  }                        
});

process.stdin.resume();

function exitHandler(options, err) {
  cars.map( car => car.disconnect());
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));