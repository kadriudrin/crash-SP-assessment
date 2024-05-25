import { Application, Assets, FillStyleInputs, Graphics, Loader, Sprite, Text, TextStyle, Texture } from "pixi.js"
import { dataService } from "./lib/DataService";
import { ELogType, ILog, IMatchData, EMatchState, EBetState, IBetState } from "../common/models";
import { config } from "../common/config";
import rocketImage from './assets/rocket.png';
import { timeToMul } from "../common/utils";

export async function main(app: Application, balanceElement: HTMLElement, betButton: HTMLButtonElement, betInput: HTMLInputElement, lastCrashes: HTMLElement, snackbar: HTMLElement) {
    const w = app.canvas.width;
    const h = app.canvas.height;

    // Main game text visuals
    const mainGameText = new Text({
        text: '', style: {
            fontFamily: 'Arial',
            fontSize: 36,
            fill: '#ffffff',
        }
    });
    mainGameText.anchor.set(0.5);
    mainGameText.x = w / 2;
    mainGameText.y = h / 2;
    app.stage.addChild(mainGameText);

    // Profit text visuals
    const profitText = new Text({
        text: '', style: {
            fontFamily: 'Arial',
            fontSize: 36,
            fill: '#00ff00',
        }
    });
    profitText.anchor.set(0.5);
    profitText.x = w / 2;
    profitText.y = (h * 0.6);
    app.stage.addChild(profitText);

    // Rocket trajectory visuals
    const trajectory = new Graphics();
    trajectory.clear();
    trajectory.moveTo(0, h);
    app.stage.addChild(trajectory);

    // Rocket visuals
    const rocketTexture = await Assets.load(rocketImage);
    const rocket = new Sprite(rocketTexture);
    rocket.anchor.set(0.5);
    const rocketSize = 30;
    rocket.setSize(rocketSize);
    rocket.visible = false;
    rocket.x = 0;
    rocket.y = h;
    app.stage.addChild(rocket);

    // Client side variables
    let balance: number;
    let snackTimeout: number | undefined;
    let midGameJoin = true;
    let betState: IBetState = { betState: EBetState.NotPlaced, amount: 0 };

    // Bet click handler
    betButton.addEventListener('click', () => {
        const parsedAmount = parseFloat(betInput.value);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            dataService.localError('Invalid Input');
            return;
        }
        dataService.betEmitter.emit(parsedAmount);
    });

    // Bet state handler (change bet button visuals)
    dataService.betStateEmitter.register((data: IBetState) => {
        let txt = "Bet";
        let bgClr = "white";
        switch (data.betState) {
            case EBetState.Placed:
                txt = "Cancel";
                bgClr = "red";
                break;
            case EBetState.Locked:
                txt = "Cashout";
                bgClr = "green";
                break;
        }
        betState = data;
        betButton.innerText = txt;
        betButton.style.background = bgClr;
    });

    // Log handler (using simple snackbar)
    dataService.logEmitter.register((data: ILog) => {
        snackbar.innerText = data.message;
        let bgClr = 'grey';
        if (data.logType === ELogType.Error) bgClr = 'red';
        else if (data.logType === ELogType.Success) bgClr = 'green';
        snackbar.style.visibility = 'visible';
        snackbar.style.backgroundColor = bgClr;

        if (snackTimeout !== undefined) {
            clearTimeout(snackTimeout);
        }
        snackTimeout = window.setTimeout(() => {
            snackbar.style.visibility = 'hidden';
            snackTimeout = undefined;
        }, 2000);
    });

    // Player balance handler
    dataService.balanceEmitter.register((data: number) => {
        balance = data;
        balanceElement.innerText = balance.toFixed(2) + '$';
    });

    // Handler for getting the list of previous crash points
    dataService.crashPointsEmitter.register((data: number[]) => {
        lastCrashes.innerHTML = '';
        data.reverse().forEach((crashPoint: number) => {
            const crashElement = document.createElement('div');
            crashElement.style.display = 'inline-block';
            crashElement.style.marginRight = '10px';
            crashElement.style.color = crashPoint === 1 ? 'red' : 'green';
            crashElement.textContent = crashPoint.toFixed(2) + 'x';
            lastCrashes.appendChild(crashElement);
        });
    });

    // Arbitrary x axis scale, ideally you'd want this to be increasing
    let maxT = 15;
    // y equivalent, since x axis is time and y axis is multiplier
    let maxTT = timeToMul(maxT);

    const dt = 1 / config.tickRate;
    let gameText = "";

    // calculate full trajectory line up to state.t without exceeding maxT
    function calculateFullTrajectory(
        line: Graphics,
        currentTime: number
    ): { x: number, y: number } {
        let x = 0, y = 0;
        line.clear();
        line.moveTo(0, h);
        for (let t = 0; t <= Math.min(currentTime, maxT); t += dt) {
            x = (w * t) / maxT;
            const tt = timeToMul(t) - 1;
            y = h - ((h * tt) / maxTT);
            line.lineTo(x, y);
        }
        return { x, y };
    }

    // Add a single point to the trajectory line
    function addTrajectoryPoint(
        line: Graphics,
        currentTime: number
    ): { x: number, y: number } {
        const x = (w * currentTime) / maxT;
        const tt = timeToMul(currentTime) - 1;
        const y = h - ((h * tt) / maxTT);
        line.lineTo(x, y);
        return { x, y };
    }

    // Tick handler, change gameText, draw rocket with trajectory, disable/enable input
    // Ideally you'd want one time state transition event handlers as well(Running -> Ended, Ended -> Starting, Starting -> Running)
    // But the overhead is not to much for this simple game
    dataService.tickEmitter.register((data: IMatchData) => {

        if (data.state === EMatchState.Running) {
            gameText = `${data.mul.toFixed(2)}x`;
            profitText.text = betState.betState === EBetState.Locked ? `+${((data.mul - 1) * betState.amount).toFixed(2)}$` : ''
            betInput.disabled = true;
            rocket.visible = true;

            // If player joins while game has already been running calculate the trajectory up to this point
            if (midGameJoin) {
                const { x, y } = calculateFullTrajectory(trajectory, data.t);
                rocket.x = Math.min(Math.max(0, x), w - rocketSize / 2);
                rocket.y = Math.min(Math.max(rocketSize / 2, y), h);
                midGameJoin = false;
            }
            // Otherwise just add a trajectory point each tick(the other option would be to recalculate the full trajectory each tick which is much more inefficient)
            else if (data.t < maxT) {
                const { x, y } = addTrajectoryPoint(trajectory, data.t);
                rocket.x = Math.min(Math.max(0, x), w - rocketSize / 2);
                rocket.y = Math.min(Math.max(rocketSize / 2, y), h);
            }

            trajectory.stroke({ width: 2, color: 0x0000ff });
        }
        // If game is in ended or starting state update text 
        else {
            gameText = data.state === EMatchState.Starting
                ? `Starting in ${(config.waitingTime - data.t).toFixed(2)}s`
                : `Round ended ${(config.endTime - data.t).toFixed(2)}s`;
            betInput.disabled = false;
            rocket.visible = false;
            midGameJoin = false;
            profitText.text = '';

            trajectory.clear();
            trajectory.moveTo(0, h);
        }
        mainGameText.text = gameText;
    });

    // init socket connection after we've already set up the event handlers
    dataService.init();
}