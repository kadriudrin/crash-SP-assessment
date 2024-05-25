import { Socket, io } from "socket.io-client";
import { ELogType, IBetState, ILog, IMatchData } from "../../common/models";
import { config } from "../../common/config";
import { SimpleEventEmitter } from "./SimpleEventEmitter";

class DataService {
    private socket?: Socket;

    // from backend
    public balanceEmitter = new SimpleEventEmitter<number>();
    public tickEmitter = new SimpleEventEmitter<IMatchData>();
    public logEmitter = new SimpleEventEmitter<ILog>();
    public betStateEmitter = new SimpleEventEmitter<IBetState>();
    public crashPointsEmitter = new SimpleEventEmitter<number[]>();

    // to backend
    public betEmitter = new SimpleEventEmitter<number>();

    init() {
        const backendIPAddress = 'localhost';

        this.socket = io(`http://${backendIPAddress}:${config.backendPort}`);

        this.socket.on("tick", (data: IMatchData) => this.tickEmitter.emit(data));
        this.socket.on("balance", (data: number) => this.balanceEmitter.emit(data));
        this.socket.on("betState", (data: IBetState) => this.betStateEmitter.emit(data));
        this.socket.on("crashPoints", (data: number[]) => this.crashPointsEmitter.emit(data));

        this.socket.on("log", (data: ILog) => this.logEmitter.emit(data));

        this.socket.on('connect', () => {
            this.betEmitter.register((data: number) => this.bet(data));
        });
    }

    public localError(message: string) {
        this.logEmitter.emit({ logType: ELogType.Error, message });
    }

    public bet(amount: number) {
        this.socket?.emit("bet", amount);
    }
}
export const dataService = new DataService();