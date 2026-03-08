import {runMonteCarlo} from "./simulator.js"
import {stressScenarios} from "./scenarios.js"

document.getElementById("runSim").addEventListener("click",run)

function getInputs(){

return{
years:+years.value,
portfolio:+portfolio.value,
stocks:+stocks.value,
bonds:+bonds.value,
withdrawRate:+withdrawRate.value,
withdrawAmount:+withdrawAmount.value,
inflation:+inflation.value
}

}

function run(){

const inputs=getInputs()

const results=runMonteCarlo(inputs)

drawCharts(results)

}

function drawCharts(results){

console.log(results)

}