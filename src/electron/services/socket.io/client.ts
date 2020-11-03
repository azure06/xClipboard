import { IDevice } from './types';
import ioClient from 'socket.io-client';
import findLocalDevices from 'local-devices';
import { Observable, ReplaySubject } from 'rxjs';
import { MessageDoc } from '@/rxdb/message/model';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import any from 'promise.any';
import path from 'path';
import fs from 'fs';
import { ports } from './utils/network';
any.shim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).client = ioClient;

const socketIoClientSettings = {
  reconnection: false,
  upgrade: false,
  transports: ['websocket'],
};

export function sendMessage(
  sender: IDevice,
  receiver: IDevice,
  message: MessageDoc
): Promise<MessageDoc> {
  return new Promise<MessageDoc>((resolve, reject) => {
    const target = `ws://${receiver.ip}:${receiver.port}`;
    const socket = ioClient.connect(target, socketIoClientSettings);
    socket.on('connect', () => {
      console.info(`Get authorization from  ${target}`);
      socket.emit('authorize', sender, (result: boolean) => {
        console.info(
          result
            ? `Yeeeeeehaw!!! 🦊  Got authorization~!`
            : 'Authorization rejected 😿'
        );
        if (!result) {
          socket.disconnect();
          reject(new Error(`${receiver.username} rejected your request 🥶`));
        }
        console.info(`Sending message to ${target} 🙈🙉🙊`);
        // Send deviceInfo and message
        socket.emit('message-text', { sender, message }, () => {
          socket.disconnect();
          console.info(`Disconnected from ${target} 👀 🎬`);
          resolve(message);
        });
      });
    });
    socket.on('connect_error', function(err: unknown) {
      console.error('Something went wrong', err);
      socket.disconnect();
      reject(err);
    });
  });
}

export function sendData(ip: string, port: number) {
  return (targetPath: string): void => {
    console.log('Target', `http://${ip}:${port}`, targetPath);
    const socket = ioClient.connect(`ws://${ip}:${port}`);
    socket.on('connect', () => {
      console.log(`Client connected with.. ws://${ip}:${port}🔥`);
      const fileName = path.basename(targetPath);
      const readStream = fs.createReadStream(targetPath);
      readStream.on('open', function() {
        socket.emit(
          'message',
          {
            fileName,
            status: 'start',
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {}
        );
      });
      readStream.on('data', function(chunk) {
        socket.emit(
          'message',
          {
            fileName,
            buffer: chunk as Buffer,
            status: 'keep',
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {}
        );
      });
      readStream.on('end', function() {
        socket.emit(
          'message',
          {
            fileName,
            status: 'end',
          },
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          () => {}
        );
      });
      readStream.on('error', function(err) {
        console.info('Something went wrong', err);
      });
    });
    socket.on('connect_error', function(err: unknown) {
      console.info('Something went wrong', err);
    });
  };
}

/**
 * Discover the available devices over the network
 * TODO: This implementation works only if subnetmask is 255.255.255.1
 *
 * Ex. From 192.168.11.1 ~ 192.168.11.254
 */
export function discoverDevices(ip: string): Observable<IDevice> {
  const iDeviceReplay = new ReplaySubject<IDevice>();
  const [network1, network2, subnet] = ip.split('.').map((value) => +value);
  // Find available devices
  findLocalDevices(
    `${network1}.${network2}.${subnet}.1-${network1}.${network2}.${subnet}.254`
  )
    .then((devices) =>
      devices
        .flatMap((device) =>
          ports.map((port) => ({
            ...device,
            port,
          }))
        )
        .map(
          (device) =>
            new Promise<void>((resolve) => {
              console.warn(device);
              const socket = ioClient.connect(
                `ws://${device.ip}:${device.port}`,
                {
                  ...socketIoClientSettings,
                  timeout: 5000,
                }
              );
              socket.on('connect_error', (error: unknown) => {
                console.info('connect_error', error);
                resolve();
              });
              socket.on('connect', () => {
                socket.emit('recognize', (username: string) => {
                  iDeviceReplay.next({ ...device, username });
                  socket.disconnect();
                  resolve();
                });
              });
            })
        )
    )
    .then((devices) => Promise.all(devices))
    .finally(() => iDeviceReplay.complete());

  return iDeviceReplay.asObservable();
}
