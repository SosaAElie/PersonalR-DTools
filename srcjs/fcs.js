const FcsParser = require("fcs");
const chartjs = require("chart.js/auto");
const ss = require("simple-statistics");

/**
 * @typedef {Object} FcsToGraphObj
 * @property {string} xTitle
 * @property {string} yTitle
 * @property {number[]} xValues
 * @property {number[]} yValues
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
    const allEventsData = getFcsForGraphing(parsedFcs, "FSC-A", "SSC-A");
    const singletsData = getFcsForGraphing(parsedFcs, "FSC-A", "FSC-H");
    const dapiData = getFcsForGraphing(parsedFcs, "FSC-A", "VL1-A");
    const irfpData = getFcsForGraphing(parsedFcs, "RL2-A", "FSC-A");
    createChart(document.getElementById("charts"), allEventsData, "scatter");
    createChart(document.getElementById("charts"), singletsData, "scatter");
    createChart(document.getElementById("charts"), dapiData, "scatter");
    createChart(document.getElementById("charts"), irfpData, "histogram");
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
                    pointRadius:1
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
                    beginAtZero:true,
                    type:"linear",
                    min:0,
                    max:400_000,
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
                        text: yTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            events:[],
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
                tooltip: {
                    enabled:false,
                },
            },
        }
    }
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
    console.log(dataMax, numberOfBins);
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
    console.log(bins, binned)
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
    
    const binnedData = createBins(xValues, xTitle, 10);

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
 * @param {HTMLElement} parent -The parent element in which the child canvas html element will be appended to
 * @param {FcsToGraphObj} fcsData 
 * @param {string} type -scatter or histogram
 * @returns {chartJs.Chart}
 */
function createChart(parent, fcsData, type){
    const canvasEle = document.createElement("canvas");
    parent.appendChild(canvasEle);
    const scatterPlotOptions = type === "scatter" ? createScatterPlotOptions(fcsData):createHistogramOptions(fcsData);
    return new chartjs.Chart(canvasEle, scatterPlotOptions);
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