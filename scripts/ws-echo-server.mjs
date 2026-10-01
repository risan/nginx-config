// A tiny WebSocket echo backend for smoke-proxy.mjs. It runs in a node container and has no dependencies.
// It accepts any upgrade request, answers 101, and replies to each text frame with "echo:" plus the text.
import { createHash } from 'node:crypto';
import http from 'node:http';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function textFrame(text) {
  const payload = Buffer.from(text);

  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(`plain:${request.url}`);
});

server.on('upgrade', (request, socket) => {
  const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.on('data', (frame) => {
    const length = frame[1] & 0x7f;
    const mask = frame.subarray(2, 6);
    const payload = Buffer.from(frame.subarray(6, 6 + length).map((byte, index) => byte ^ mask[index % 4]));
    socket.write(textFrame(`echo:${payload.toString()}`));
  });
  socket.on('error', () => {});
});

server.listen(8082);
