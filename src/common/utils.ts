import crypto from "crypto";
import { config } from "./config";

// Polynomial generated by extracting points (t, mul) from Roobet's Crash and using python to estimate the polynomial
export function timeToMul(t: number) {
    return (
        0.0001085 * Math.pow(t, 3) -
        0.0003492 * Math.pow(t, 2) +
        0.07938 * t +
        1
    );
}

// Roobet's Crash version original publicly available crashpoint generation algorithm

export function divisible(hash: any, mod: any) {
    let val = 0;
    const o = hash.length % 4;

    for (let i = o > 0 ? o - 4 : 0; i < hash.length; i += 4)
        val = ((val << 16) + parseInt(hash.substr(i, 4), 16)) % mod;

    return val === 0;
}

export function genMul() {
    const salt = "0000000000000000000fa3b65e43e4240d71762a5bf397d5304b2596d116859c";
    const seed = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHmac("sha256", seed).update(salt).digest("hex");

    // Crashes RTP is calculated using 1 - 1/x, where x is the frequency of crashes at 1
    // Our RTP is dynamically modifiable via crashPer for example, if crashPer = 20, it means the game crashes at 1 every 20 games on average which is an RTP of 95%
    // if crashPer = 5, we get an RTP of 80%
    if (divisible(hash, config.crashPer)) return 1.0;

    const h = parseInt(hash.slice(0, 52 / 4), 16);
    const e = Math.pow(2, 52);

    return Number(
        (Math.floor(((100 * e - h) / (e - h))) / 100.0).toFixed(2)
    );
}
