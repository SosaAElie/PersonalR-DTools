const FcsParser = require("fcs");
const chartjs = require("chart.js/auto");
const chartjshelpers = require("chart.js/helpers");
const ss = require("simple-statistics");

/**
 * @typedef {Object} FcsToGraphObj
 * @property {string} xTitle
 * @property {string} yTitle
 * @property {number[]} xValues
 * @property {number[]} yValues
 */

/**
 * @typedef {Object} CanvasChartObj
 * @property {chartjs.Chart} chart
 * @property {HTMLCanvasElement} canvas
 */

function main(){
    document.getElementById("fcs-input").addEventListener("input", handleFileInput);
}

/**
 * @param {InputEvent} e
 */
async function handleFileInput(e){
    /**
     * @type {FileList}
     */
    const files = e.target.files;
    if (files.length <= 0) return;

    for (let file of files){
        processFcsFile(file);
        e.target.nextSibling.textContent+=file.name;
    };

}

/**
 * @param {File} file
 * @returns {void}
 */
async function processFcsFile(file){
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsingOptions = {dataFormat:"asNumber", eventsToRead:-1};
    const parsedFcs = new FcsParser(parsingOptions, fileBuffer);
    const allEventsData = getFcsForGraphing(parsedFcs, "SSC-A", "FSC-A");
    const parentContainer = document.getElementById("charts");
    const canvasChartObj = createChart(allEventsData, "scatter");
    const chartContainer = completeChart(canvasChartObj, 
        [
            createAxisDropDown("x", parsedFcs, canvasChartObj), 
            createAxisDropDown("y", parsedFcs, canvasChartObj),
            createLogLinearDropDown("x", canvasChartObj),
            createLogLinearDropDown("y", canvasChartObj),
            createMaxMinAxisInput("x", canvasChartObj),
            createMaxMinAxisInput("y", canvasChartObj),
            createMetaData(allEventsData, canvasChartObj),
        ])
    parentContainer.appendChild(chartContainer);

}

/**
 * @param {FcsToGraphObj} fcsData
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createMetaData(fcsData, canvasChartObj){
    const metaDataContainer = document.createElement("div");
    metaDataContainer.className = "metadata";
    metaDataContainer.id = `${canvasChartObj.canvas.id}-metadata`;

    const numberOfEventsEle = document.createElement("p");
    numberOfEventsEle.textContent = `Number of Events: ${fcsData.xValues.length}`;

    const percentageOfEventGatedEle = document.createElement("p");
    percentageOfEventGatedEle.textContent = "";

    metaDataContainer.appendChild(numberOfEventsEle);
    metaDataContainer.appendChild(percentageOfEventGatedEle);

    return metaDataContainer;
}

/**
 * @param {CanvasChartObj} canvasChartObj
 * @param {Array<HTMLElement>} userInputsAndChartData
 */
function completeChart(canvasChartObj, userInputsAndChartData){
    const container = document.createElement("div");
    container.className = "chart-container";
    container.appendChild(canvasChartObj.canvas);
    container.style.gridTemplateRows = userInputsAndChartData.length;
    canvasChartObj.canvas.style.gridRow = `span ${userInputsAndChartData.length}`;
    for(let i of userInputsAndChartData){
        container.appendChild(i);    
    }

    return container;
}

/**
 * @param {FcsToGraphObj} fcsData
 * @returns {chartjs.ChartConfiguration}
 */
function createScatterPlotOptions({xTitle, yTitle, xValues, yValues}){
    if(xValues.length !== yValues.length){
        console.log("The number of X-values and Y-values have to be the same.");
        return {};
    }

    //Return the chart options object
    return {
        type:"scatter",
        data:{
            datasets:[  
                {
                    data:xValues.map((x, i) => {return {x, y:yValues[i]}}),
                    radius: 1,
                    hoverRadius: 1,  // No size increase on hover
                    hitRadius: 1,    // Keeps click precision tight
                    hoverBorderWidth: 0,
                    borderWidth: 1
                },
            ]
        },
        options:{
            hover:{
                mode:null,
            },
            maintainAspectRatio:false,
            scales:{
                x:{
                    border:{
                        color:"black",
                    },
                    type:"linear",
                    beginAtZero:true,
                    min:0,
                    defaultMax:ss.max(xValues),
                    grid:{
                        color:"black",
                        tickColor:"black",
                        drawOnChartArea:false,
                    },
                    ticks:{
                        textStrokeColor:"black",
                        color:"black",
                    },
                    position:"bottom",
                    title:{
                        display:true,
                        text:xTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black",
                    },
                    
                },
                y:{
                    border:{
                        color:"black",
                    },
                    beginAtZero:true,
                    type:"linear",
                    defaultMax:ss.max(yValues),
                    min:0,
                    grid:{
                        drawOnChartArea:false,
                        color:"black",
                        tickColor:"black",
                    },
                    ticks:{
                        textStrokeColor:"black",
                        color:"black",
                    },
                    title:{
                        display:true,
                        text: yTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            events:["click"],
            onClick: function (e) {
                const {x,y} = chartjshelpers.getRelativePosition(e, this);
                
                const chartX = this.scales.x.getValueForPixel(x);
                const chartY = this.scales.y.getValueForPixel(y);
                /**
                 * @type {CanvasRenderingContext2D}
                */
               const ctx = this.ctx;
               
                //There will only ever be up to 2 datasets in a chart,
                //the gating points and the actual event data itself
                if (this.data.datasets.length === 1){
                    const clickedPointsData = {
                        data:[{x:chartX,y:chartY}],
                        relativePositions:[{x,y}],
                        pointRadius:2,
                        backgroundColor:"black",
                        borderColor:"black",
                    }
                    this.data.datasets.push(clickedPointsData);
                    
                    //position ctx at the starting location of the gate
                    
                }
                else{
                    this.data.datasets[1].data.push({x:chartX,y:chartY});
                    this.data.datasets[1].relativePositions.push({x,y});
                }

               this.update();
            },
            animation:{
                duration:0,
                onComplete: function(e){
                    if(this.data.datasets.length <= 1){
                        console.log("No gate points present in chart dataset");
                        return;
                    }
                    
                    if(this.data.datasets[1].relativePositions.length === 1){
                        console.log("only one point available");
                        return;
                    }

                    this.ctx.beginPath();
                    const gatePoints = this.data.datasets[1].relativePositions;
                    const startingPoint = gatePoints[0];
                    this.ctx.moveTo(startingPoint.x, startingPoint.y);
                    for(let i = 1; i < gatePoints.length; i++){
                        const {x,y} = gatePoints[i];
                        this.ctx.lineTo(x,y);
                        this.ctx.stroke();
                    }
                }
            },
            plugins:{
                legend:{
                    display:false,
                },
                tooltip: {
                    enabled:false,
                },
            },
        }
    }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 */
function enableGatingLine(ctx, x, y){
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo()
}

/**
 * @param {number[]} data 
 * @param {string} dataTitle 
 * @param {number} numberOfBins
 * @returns {FcsToGraphObj}
 */
function createBins(data, dataTitle, numberOfBins){
    // const dataMax = ss.max(data);
    const dataMax = 50_000;
    const binWidth = Math.ceil(dataMax/numberOfBins);
    const bins = [];
    const binned = [];
    for(let i = binWidth; i < dataMax+binWidth; i+=binWidth){
        bins.push(i);
        binned.push(0);
    }

    for(let i = 0; i < data.length; i++){
        for (let j = 0; j < bins.length; j++){
            if(data[i] < bins[j]) {
                binned[j]+=1;
                break;
            };
        }
    }
    return{
        xTitle:dataTitle,
        yTitle:"Count",
        xValues:bins,
        yValues:binned,
    }

}


/**
 * @param {FcsToGraphObj} fcsData
 * @returns {chartjs.ChartConfiguration}
 */
function createHistogramOptions({xTitle, yTitle, xValues, yValues}){

    if(xValues.length !== yValues.length && yTitle !== "histogram"){
        console.log("The number of X-values and Y-values have to be the same if the chart type is not meant to be a histogram.");
        return {};
    }
    
    const binnedData = createBins(xValues, xTitle, 100);

    //Return the chart options object
    return {
        type:"bar",
        data:{
            datasets:[  
                {
                    data:binnedData.xValues.map((x, i) => {return {x, y:binnedData.yValues[i]}}),
                    borderWidth: 1,
                    barPercentage: 1,
                    categoryPercentage: 1,
                    borderRadius: 5,
                },
            ]
        },
        options:{
            maintainAspectRatio:false,
            scales:{
                x:{
                    type:"linear",
                    beginAtZero:true,
                    min:0,
                    // max:1_000_000,
                    grid:{
                        color:"black",
                        tickColor:"black",
                    },
                    ticks:{
                        textStrokeColor:"black",
                        color:"black",
                        stepSize:1,
                    },
                    position:"bottom",
                    title:{
                        display:true,
                        text:binnedData.xTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black",
                    },
                    
                },
                y:{
                    beginAtZero:true,
                    type:"linear",
                    min:0,
                    // max:400_000,
                    grid:{
                        color:"black",
                        tickColor:"black",
                    },
                    ticks:{
                        textStrokeColor:"black",
                        color:"black",
                    },
                    title:{
                        display:true,
                        text: binnedData.yTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            // events:[],
            plugins:{
                // title:{
                //     display:true,
                //     text: title,
                //     font:{
                //         size:16,
                //     },
                //     color: "black",
                // },
                legend:{
                    display:false,
                },
                // tooltip: {
                //     enabled:false,
                // },
            },
        }
    }
}


/**
 * @param {FcsToGraphObj} fcsData 
 * @param {string} type -scatter or histogram
 * @returns {CanvasChartObj}
 */
function createChart(fcsData, type){
    const canvasEle = document.createElement("canvas");
    canvasEle.id = `chart-${Math.random()*Math.random()}`;
    const scatterPlotOptions = type === "scatter" ? createScatterPlotOptions(fcsData):createHistogramOptions(fcsData);
    return {canvas:canvasEle, chart: new chartjs.Chart(canvasEle, scatterPlotOptions)};
}

/**
 * @param {string} xOrY
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createLogLinearDropDown(xOrY, canvasChartObj){
    const labelEle = document.createElement("label");
    labelEle.setAttribute("for", `${canvasChartObj.canvas.id}-${xOrY}-scale-label`);
    labelEle.textContent = `${xOrY}-Scale: `;
    const selectEle = document.createElement("select");
    selectEle.id = `${canvasChartObj.canvas.id}-${xOrY}-scale-label`;

    for(let scaleOption of ["linear", "logarithmic"]){
        const optionEle = document.createElement("option");
        optionEle.textContent = scaleOption;
        optionEle.value = scaleOption;
        selectEle.appendChild(optionEle);
    }

    const container = document.createElement("div");
    container.appendChild(labelEle);
    container.appendChild(selectEle);

    selectEle.addEventListener("change", e =>{
        const scale = e.target.value;
        updateChartScale(xOrY, scale, canvasChartObj.chart);
    })

    return container;
}

/**
 * @param {string} xOry
 * @param {FcsParser} parsedFcs
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createAxisDropDown(xOry, parsedFcs, canvasChartObj){
    const xAxisTitles = parsedFcs.get$PnX('N');

    const labelEle = document.createElement("label");
    labelEle.textContent = `${xOry}-Axis: `;
    labelEle.setAttribute("for", `${canvasChartObj.canvas.id}-${xOry}-axis-label`);

    const selectEle = document.createElement("select");
    selectEle.id = `${canvasChartObj.canvas.id}-${xOry}-axis-label`;

    for (let xAxisTitle of xAxisTitles){
        const optionEle = document.createElement("option");
        optionEle.textContent = xAxisTitle;
        optionEle.value = xAxisTitle;
        selectEle.appendChild(optionEle);
        if(xOry === "y" && xAxisTitle === "FSC-A") optionEle.selected = true;
        else if(xOry === "x" && xAxisTitle === "SSC-A") optionEle.selected = true;

    }


    selectEle.addEventListener("change", e =>{
        const otherAxisLabel = xOry === "y"?"x":"y";
        const otherAxis = document.getElementById(`${canvasChartObj.canvas.id}-${otherAxisLabel}-axis-label`);
        if(otherAxis === null || otherAxis.value === "null"){
            console.log("Other axis does not have a value selected.");
            return;
        };

        const axisTitle = e.target.value;
        const otherAxisTitle = otherAxis.value;
        const fcsData = getFcsForGraphing(parsedFcs, xOry === "x"?axisTitle:otherAxisTitle, xOry === "y"?axisTitle:otherAxisTitle);
        updateChartData(fcsData, canvasChartObj.chart);
    })

    const container = document.createElement("div");

    container.appendChild(labelEle);
    container.appendChild(selectEle);
    container.className = "axis"
    return container;
}

/**
 * @param {string} xOrY
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createMaxMinAxisInput(xOrY, canvasChartObj){
    const id = `${canvasChartObj.canvas.id}-${xOrY}-maxMin-label`;

    const labelEle = document.createElement("label");
    labelEle.textContent = `${xOrY}-Axis: `;
    labelEle.setAttribute("for", id);
    
    const inputEle = document.createElement("input");
    inputEle.type = "number";
    inputEle.id = id;
    inputEle.defaultValue = canvasChartObj.chart.options.scales[xOrY].defaultMax;

    const container = document.createElement("div");
    container.appendChild(labelEle);
    container.appendChild(inputEle);

    inputEle.addEventListener("change", e =>{
        const value = parseInt(e.target.value);
        if(value < 0) {
            console.log("axis value cannot be less than 0");
            return;
        }
        if(isNaN(value)){
            inputEle.value = inputEle.defaultValue;
            updateChartAxisMaxMin(xOrY, canvasChartObj.chart.options.scales[xOrY].defaultMax, canvasChartObj.chart);
        }
        else{
            updateChartAxisMaxMin(xOrY, value, canvasChartObj.chart);
        }
    })
    
    return container;
}
/**
 * @param {FcsParser} parsedFcs -The options object passed into the new FcsParser needs to have 'dataFormat:"asNumber"' property.
 * @param {string} parameterName -The name of the parameter to obtain values from i.e SSC-A, FSC-A, etc.
 * @param {number} numOfEvents -Default value is -1 to indicate all events.
 * @returns {Generator<number>}
*/
function* getParameterValuesGenerator(parsedFcs, parameterName, numOfEvents = -1){
    const allChannels = parsedFcs.get$PnX('N');
    const parameterIndex = allChannels.indexOf(parameterName);

    if(parameterIndex < 0){
        console.log("The parameter name does not exist in this .fcs file.");
        return;
    }

    for (let i = 0; i < (numOfEvents > 0 ? numOfEvents:parsedFcs.dataAsNumbers.length); i++){
        yield parsedFcs.dataAsNumbers[i][parameterIndex];
    }
}

/**
 * @param {FcsParser} parsedFcs -The options object passed into the new FcsParser needs to have 'dataFormat:"asNumber"' property.
 * @param {string} parameterName -The name of the parameter to obtain values from i.e SSC-A, FSC-A, etc.
 * @param {number} numOfEvents -Default value is -1 to indicate all events.
 * @returns {Array<number>}
*/
function getParameterValues(parsedFcs, parameterName, numOfEvents = -1){
    const allChannels = parsedFcs.get$PnX('N');
    const parameterIndex = allChannels.indexOf(parameterName);
    const data = [];

    if(parameterIndex < 0){
        console.log("The parameter name does not exist in this .fcs file.");
        return [];
    }

    for (let i = 0; i < (numOfEvents > 0 ? numOfEvents:parsedFcs.dataAsNumbers.length); i++){
        data.push(parsedFcs.dataAsNumbers[i][parameterIndex]);
    }

    return data;
}

/**
 * @param {FcsToGraphObj}fcsToGraphObj
 * @param {chartjs.Chart}chart
 */
function updateChartData(fcsToGraphObj, chart){
    chart.data.datasets[0].data = fcsToGraphObj.xValues.map((x, i) => {return{x, y:fcsToGraphObj.yValues[i]}});
    chart.options.scales.x.title.text = fcsToGraphObj.xTitle;
    chart.options.scales.y.title.text = fcsToGraphObj.yTitle;
    chart.update();
}

/**
 * @param {string} xOrY
 * @param {string} scale
 * @param {chartjs.Chart}chart
 */
function updateChartScale(xOrY, scale, chart){
    chart.options.scales[xOrY].type = scale;
    chart.update();
}

/**
 * @param {string} xOrY
 * @param {number} maxMin
 * @param {chartjs.Chart}chart
 */
function updateChartAxisMaxMin(xOrY, maxMin, chart){
    chart.options.scales[xOrY].max = maxMin;
    chart.update();
}

/**
 * @param {FcsParser} parsedFcs -The options object passed into the new FcsParser needs to have 'dataFormat:"asNumber"' property.
 * @param {string} xParam -The name of the parameter to obtain values from i.e SSC-A, FSC-A, etc. this will be placed on the x-axis
 * @param {string} yParam -The name of the parameter to obtain values from i.e SSC-A, FSC-A, etc. this will be placed on the y-axis
 * @param {number} numOfEvents -Default value is -1 to indicate all events.
 * @returns {FcsToGraphObj}
 */
function getFcsForGraphing(parsedFcs, xParam, yParam, numOfEvents = -1){
    return {
        xTitle:xParam,
        yTitle:yParam,
        xValues:getParameterValues(parsedFcs, xParam, numOfEvents),
        yValues:getParameterValues(parsedFcs, yParam, numOfEvents),
    }
}

main()