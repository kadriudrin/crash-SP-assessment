import { Socket } from "socket.io";
import { config } from "../common/config";
import { IBet, IMatchData, EMatchState, ELogType, EBetState, IBetState } from "../common/models";
import { io } from "./server";
import { genMul, timeToMul } from "../common/utils";

class Match {
    private roomId: string;

    // Public data
    private matchData: IMatchData;
    private lastCrashes: number[];

    // Private only data, not shared to players
    private players: Map<string, number>;
    private roundBets: IBet[];
    private goalMul: number;

    constructor(roomId: string) {
        this.roomId = roomId;

        this.roundBets = [];
        this.goalMul = -1;
        this.lastCrashes = [];

        this.matchData = {
            state: EMatchState.Ended,
            t: config.waitingTime,
            mul: 1,
        };

        this.players = new Map();
    }

    setPlayer(id: string, newBalance = config.startingBalance) {
        this.players.set(id, newBalance);
        io.to(id).emit('balance', newBalance);
    }

    removePlayer(id: string) {
        this.players.delete(id);
    }

    setBetState(id: string, state: IBetState) {
        io.to(id).emit('betState', state);
    }

    info(id: string, msg: string) {
        io.to(id).emit('log', { logType: ELogType.Info, message: msg });
    }

    err(id: string, msg: string) {
        io.to(id).emit('log', { logType: ELogType.Error, message: msg });
    }

    succ(id: string, msg: string) {
        io.to(id).emit('log', { logType: ELogType.Success, message: msg });
    }

    // Bet function deals with placing and unplacing bets, and cashing out when the player has a placed bet while the game is running 
    bet(id: string, amount: number) {
        const balance = this.players.get(id);

        if (balance === undefined) {
            this.err(id, 'Invalid balance');
            return;
        }

        const isWaiting = this.matchData.state === EMatchState.Starting;
        const isRunning = this.matchData.state === EMatchState.Running;
        const isEnded = this.matchData.state === EMatchState.Ended;

        const betIndex = this.roundBets.findIndex((bet: IBet) => bet.playerId === id);
        const betWasPlaced = betIndex !== -1;

        if (betWasPlaced) {
            const betAmount = this.roundBets[betIndex].amount;
            this.roundBets.splice(betIndex, 1);

            const ml = isRunning ? this.matchData.mul : 1;

            this.setPlayer(id, balance + betAmount * ml);

            if (isWaiting)
                this.info(id, 'Unplaced bet');
            else if (isRunning)
                this.succ(id, 'Win amount: ' + (betAmount * (ml - 1)).toFixed(2) + '$');

            this.setBetState(id, { betState: EBetState.NotPlaced, amount: 0 });
            return;
        }
        else if (isWaiting) {
            if (amount <= 0) {
                this.err(id, 'Invalid amount');
                return;
            }

            if (amount > balance) {
                this.err(id, 'Insufficient balance');
                return;
            }

            const newBalance = balance - amount;
            this.setPlayer(id, newBalance);
            this.roundBets.push({ playerId: id, amount: amount });

            this.info(id, 'Placed bet');
            this.setBetState(id, { betState: EBetState.Placed, amount });
        }
        else if (isEnded || isRunning) this.err(id, 'Wait for game to restart!')
    }

    addCrash(crashPoint: number) {
        this.lastCrashes.push(crashPoint);
        io.to(this.roomId).emit('crashPoints', this.lastCrashes);
    }

    init(socket: Socket) {
        match.setPlayer(socket.id);
        socket.emit('crashPoints', this.lastCrashes);
        this.info(socket.id, "Connected!");
    }

    // Main game loop running at config.tickRate times a second, standards are 64, 128
    tick(dt: number) {
        this.matchData.t += dt;

        if (this.matchData.state == EMatchState.Starting) {
            if (this.matchData.t >= config.waitingTime) {
                this.matchData.state = EMatchState.Running;
                this.matchData.t = 0;

                this.roundBets.forEach((bet: IBet) => {
                    this.setBetState(bet.playerId, { betState: EBetState.Locked, amount: bet.amount });
                    this.info(bet.playerId, `Locked bet of ${bet.amount.toFixed(2)}$`);
                });
                this.goalMul = genMul();
            }
        }
        else if (this.matchData.state == EMatchState.Running) {
            this.matchData.mul = timeToMul(this.matchData.t);
            if (this.matchData.mul >= this.goalMul) {
                this.matchData.state = EMatchState.Ended;
                this.matchData.mul = this.goalMul;
                this.addCrash(this.goalMul);
                this.matchData.t = 0;
                this.roundBets.forEach((bet: IBet) => {
                    this.setBetState(bet.playerId, { betState: EBetState.NotPlaced, amount: 0 });
                    this.err(bet.playerId, 'Crashed and you lost: ' + bet.amount + '$');
                });
                this.roundBets = [];
            }
        }
        else if (this.matchData.state == EMatchState.Ended) {
            if (this.matchData.t >= config.endTime) {
                this.matchData.state = EMatchState.Starting;
                this.matchData.t = 0;
            }
        }

        io.to(this.roomId).emit('tick', this.matchData);
    }
}

export const match = new Match('main');