export function runMonteCarlo(inputs){

const runs=1000
const years=inputs.years

let results=[]

for(let r=0;r<runs;r++){

let value=inputs.portfolio
let path=[]

for(let y=0;y<years;y++){

const returnRate=randomNormal(.07,.15)

value=value*(1+returnRate)

value-=inputs.withdrawAmount

path.push(value)

}

results.push(path)

}

return results

}

function randomNormal(mean,sd){

let u=Math.random()
let v=Math.random()

return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)

}