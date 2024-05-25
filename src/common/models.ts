export enum EMatchState {
    Starting,
    Running,
    Ended,
}

export interface IBet {
    playerId: string;
    amount: number;
}

export interface IMatchData {
    state: EMatchState;
    t: number;
    mul: number;
}

export enum ELogType {
    Info,
    Error,
    Success
}

export interface ILog {
    logType: ELogType;
    message: string;
}

export enum EBetState {
    NotPlaced,
    Placed,
    Locked
}

export interface IBetState {
    betState: EBetState;
    amount: number;
}