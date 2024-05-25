import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server, Socket } from "socket.io";
import { match } from './match';
import { config } from '../common/config';

const app = express();
app.use(cors());
const server = http.createServer(app);
export const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    }
});

io.on('connection', (socket: Socket) => {
    console.log(socket.id + ' connected');
    socket.join("main");

    match.init(socket);

    socket.on('disconnect', () => {
        match.removePlayer(socket.id);
        console.log(socket.id + ' disconnected');
    });

    socket.on('bet', (amount: number) => {
        match.bet(socket.id, amount);
    });
});

server.listen(config.backendPort, '0.0.0.0', () => {
    console.log(`localhost:${config.backendPort}`);
});

setInterval(() => {
    match.tick(config.tickRate / 1000);
}, config.tickRate);