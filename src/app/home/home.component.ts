import { Component, OnInit } from '@angular/core';
import * as application from 'tns-core-modules/application';
import * as platform from 'tns-core-modules/platform';
import { Router } from "@angular/router";
import { MQTTClient, ClientOptions, SubscribeOptions } from "nativescript-mqtt";
import { Message } from "nativescript-mqtt/common";
import * as Permissions from "nativescript-permissions";
import { JsonPipe } from '@angular/common';
import { exit } from 'nativescript-exit';
import { keepAwake, allowSleepAgain } from "nativescript-insomnia";
import * as tf from '@tensorflow/tfjs';
import * as tsnode from '@tensorflow/tfjs-node';
import * as speechCommands from '@tensorflow-models/speech-commands';
import { getCoordsDataType } from '@tensorflow/tfjs-core/dist/backends/webgl/shader_compiler';
import { connect } from 'http2';

declare var android: any;

@Component({
  selector: 'ns-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  moduleId: module.id,
})
export class HomeComponent implements OnInit {
  publish_frequency: number = 1000;
  mqtt_host: string = "192.168.1.6";
  mqtt_port: number = 3000;
  mqtt_useSSL: boolean = false;
  mqtt_path: string = "/mqtt";
  mqtt_username: string = "Huawei_Watch";
  mqtt_password: string = "";
  mqtt_topic: string = "watch3/ack";
  mqtt_cleanSession: boolean = true;
  heartRate = 0;
  battery;
  timestamp;
  av_Mem;
  totalMemory;
  init;
  router: Router;

  mqtt_clientOptions: ClientOptions = {
    host: this.mqtt_host,
    port: this.mqtt_port,
    useSSL: this.mqtt_useSSL,
    cleanSession: this.mqtt_cleanSession
  };

  mqtt_client: MQTTClient = new MQTTClient(this.mqtt_clientOptions);

  loading: boolean = false;

  connect(): void {
    try {
      this.mqtt_client.connect(this.mqtt_username, this.mqtt_password);
      console.log('Connection tried!');

    }
    catch (e) {
      console.log("Caught error: " + e);
    }
  }

  subscribe(): void {
    try {
      const opts: SubscribeOptions = {
        qos: 0
      };
      const opts2: SubscribeOptions = {
        qos: 1
      }

      this.mqtt_client.subscribe(this.mqtt_topic, opts);
      this.mqtt_client.subscribe('watch3/start', opts);
      this.mqtt_client.subscribe('watch3/kill', opts);
      this.mqtt_client.publish(new Message({ payloadString: "Huawei Ready", destinationName: 'watch3/connect' }));
    }
    catch (e) {
      console.log("Caught error: " + e);
    }
  }

  setupHandlers(): void {
    this.mqtt_client.onConnectionFailure.on((err) => {
      console.log("Connection failed: " + err);
    });

    this.mqtt_client.onConnectionSuccess.on(() => {
      console.log("Connected successfully!");

      this.subscribe();
      this.registerProximityListener();
    });

    this.mqtt_client.onConnectionLost.on((err) => {
      console.log("Connection lost: " + err);
      this.mqtt_client.publish(new Message({ payloadString: "Disconnected", destinationName: 'watch3/disconnect' }));
      exit();
    });

    this.mqtt_client.onMessageArrived.on((message: Message) => {
      if (message.topic == 'watch3/start') {
        console.log('Received Start Code!');
        var msg = JSON.parse(message.payload);
        this.publish_frequency = msg.frequency;
        if (msg.test_type == 'baseline') {
          console.log('Baseline Run!');
          setInterval(() => {
            this.mqtt_client.publish(new Message({
              payloadString: JSON.stringify({
                timestamp: new Date().getTime()
                , heartRate: this.heartRate, av_Mem: this.av_Mem, totalMemory: this.totalMemory, battery: this.battery, roundtrip_time: 0
              }), destinationName: 'watch3/finaldata'
            }));
          }, this.publish_frequency);
        } else {
          setInterval(() => {
            this.init = new Date();
            this.timestamp = new Date().getTime();
            console.log('Publish frequency is: ' + this.publish_frequency);
            this.mqtt_client.publish(new Message({
              payloadString: JSON.stringify({
                timestamp: this.timestamp
                , heartRate: this.heartRate, av_Mem: this.av_Mem, totalMemory: this.totalMemory, battery: this.battery
              }), destinationName: 'watch3/watchdata'
            }));
          }, this.publish_frequency);
        }

      } else if (message.topic == 'watch3/ack') {
        console.log("Message received: " + message.payload);
        this.mqtt_client.publish(new Message({
          payloadString: JSON.stringify({
            timestamp: this.timestamp,
            heartRate: this.heartRate,
            battery: this.battery,
            av_Mem: this.av_Mem,
            totalMemory: this.totalMemory,
            roundtrip_time: new Date().getTime() - this.init
          }), destinationName: 'watch3/finaldata'
        }));
      } else if (message.topic == 'watch3/kill') {
        console.log('Huawei Kill Code Received!');
        this.mqtt_client.unsubscribe('watch3/start');
        this.mqtt_client.unsubscribe('watch3/ack');
        exit();
      }

    });

    this.mqtt_client.onMessageDelivered.on((message: Message) => {
      console.log("Message delivered: " + message.payload);
    });
  }


  constructor() {
    Permissions.requestPermission(android.Manifest.permission.BODY_SENSORS, "Needed for connectivity status").then(() => {
      console.log("Permission granted!");
    }).catch(() => {
      console.log("Permission is not granted (sadface)");
    });
    keepAwake().then(function () {
      console.log("Insomnia is active");
    });
    //  // Define a model for linear regression.
    //  const model = tf.sequential();
    //  model.add(tf.layers.dense({ units: 1, inputShape: [1] }));
    //  console.log('Model created');
    //  console.log(model.toJSON());
    //  // Prepare the model for training: Specify the loss and the optimizer.
    //  model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });
    //  console.log(tf.util.now());
    //  // Generate some synthetic data for training.
    //  const xs = tf.tensor2d([1, 2, 3, 4, 5, 6, 7, 8], [8, 1]);
    //  const ys = tf.tensor2d([1, 2, 3, 4, 5, 6, 7, 8], [8, 1]);
    //  console.log('Just before fitting');
    //  // Train the model using the data.
    //  var init2 = new Date();
    // //  tf.loadLayersModel('http://192.168.1.101:4580/model.json').then((loadedModel) => {
    // //    console.log('Second promise resolved');
    // //    console.log(loadedModel);
    // //    console.log('Model has been loaded');
    // //    console.log('Prediction2 ' + loadedModel.predict(tf.tensor2d([1], [1, 1])).toString());
    // //    //loadedModel.predict(tf.tensor2d([1], [1, 1])).print();
    // //    //loadedModel.summary();
    // //  });
    //   model.fit(xs, ys, { epochs: 500 }).then(() => {
    //     console.log();
    //     // Use the model to do inference on a data point the model hasn't seen before:
    //     console.log(model.predict(tf.tensor2d([2], [1, 1])).toString());
    //   }).catch(error => {
    //     console.log('Promise rejected');
    //     console.log(error);
    //   });
    this.connect();
    this.setupHandlers();
  }

  ngOnInit() {
    // var pol = android.provider.Settings.Global.WIFI_SLEEP_POLICY_NEVER;
    // android.provider.Settings.Global.putInt(application.android.context.getContentResolver(), android.provider.Settings.Global.WIFI_SLEEP_POLICY, pol);
    application.android.registerBroadcastReceiver(
      android.content.Intent.ACTION_BATTERY_CHANGED,
      (androidContext, intent) => {
        const level = intent.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
        const scale = intent.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
        const percent = (level / scale) * 100.0;
        // vm.set("batteryLife", percent.toString());
        console.log('Got battery: ' + level);
        this.battery = level;
      });
    // setTimeout(()=>{
    //   exit();
    // }, 30000);
  }

  registerProximityListener() {
    console.log('Entered the function!');
    // Get android context and Sensor Manager object
    const activity = application.android.startActivity || application.android.foregroundActivity;
    if (!activity) {
      console.log('Nooott');
    }

    var mi = new android.app.ActivityManager.MemoryInfo();
    var activityManager = application.android.context.getSystemService(android.content.Context.ACTIVITY_SERVICE);

    activityManager.getMemoryInfo(mi);
    let usedMemory = mi.totalMem - mi.availMem;
    console.log("availMem in bytes: " + mi.availMem);
    console.log("Total mem in bytes:" + mi.totalMem);
    this.av_Mem = mi.availMem;
    this.totalMemory = mi.totalMem;

    const mSensorManager = activity.getSystemService(
      android.content.Context.SENSOR_SERVICE
    );
    if (mSensorManager == null) {
      console.log('Nooot manager');
    }
    // const sensorList = mSensorManager.getSensorList(android.hardware.Sensor.TYPE_ALL);
    // console.log(Object.prototype.toString.call(sensorList));
    // console.dir(sensorList);
    // console.log(sensorList.size());
    // const array = sensorList.toArray();
    // console.log(array.length);
    // console.log(sensorList.getClass());
    // for(var i = 0;i<array.length;i++){
    //   console.log(array[i]);
    // }
    // Creating the listener and setting up what happens on change
    const sensorListener = new android.hardware.SensorEventListener({
      onAccuracyChanged: (sensor, accuracy) => { console.log(sensor); },
      onSensorChanged: event => {
        this.heartRate = event.values[0].toString();
        console.log("Heart Rate" + this.heartRate);
        // this.router.navigate(['/items']);
      }
    });

    // Get the proximity sensor
    if (mSensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_STRESS_MONITOR) != null) {
      console.log('Success 1');
    } else {
      console.log('1 not ava');
    }
    if (mSensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_BREATH_MONITOR) != null) {
      console.log('Success 2');
    } else {
      console.log('2 not ava');
    }
    if (mSensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_SLEEP_MONITOR) != null) {
      console.log('Success 3');
    } else {
      console.log('3 not ava');
    }
    if (mSensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_POSTURE) != null) {
      console.log('Success 4');
    } else {
      console.log('4 not ava');
    }
    const mHeartRateSensor = mSensorManager.getDefaultSensor(
      android.hardware.Sensor.TYPE_ACCELEROMETER
    );

    // Register the listener to the sensor
    const success = mSensorManager.registerListener(
      sensorListener,
      mHeartRateSensor,
      android.hardware.SensorManager.SENSOR_DELAY_FASTEST
    );

    console.log('Registering listener succeeded: ' + success);
  }

}
