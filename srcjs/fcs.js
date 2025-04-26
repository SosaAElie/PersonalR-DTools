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

/**
 * @typedef {Object} FcsEvent
 * @property {Map<string, number} data
 * @property {number} identifier
 * @property {string} filename
 */

/**
 * @typedef {Object} ChartDataObject
 * @property {number} x
 * @property {number} y
 * @property {FcsEvent} self
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
    
    //grab filename, each filename is assumed to be unique
    const filename = file.name.slice(0, file.name.lastIndexOf("."));

    //create buffer so that the parser library can parse the data
    //read all events into memory
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const parsingOptions = {dataFormat:"asNumber", eventsToRead:-1};
    const parsedFcs = new FcsParser(parsingOptions, fileBuffer);

    //create an array of object where each object represents an event
    //and its associated flow data
    const fcsEvents = convertToFcsEventObjs(parsedFcs, filename);

    //Create a container for each file that contains all the charts for it
    const parentContainer = document.getElementById("charts");
    const fileContainer = createFileContainer(filename);
    const canvasChartObj = createChartV2(fcsEvents, "SSC-A", "FSC-A", "scatter");
    const chartContainer = completeChart(canvasChartObj, 
        [
            createAxisDropDown("x", fcsEvents, canvasChartObj), 
            createAxisDropDown("y", fcsEvents, canvasChartObj),
            createLogLinearDropDown("x", canvasChartObj),
            createLogLinearDropDown("y", canvasChartObj),
            createMaxMinAxisInput("x", canvasChartObj),
            createMaxMinAxisInput("y", canvasChartObj),
            createEnterGateButton(canvasChartObj),
            createMetaDataV2(fcsEvents, canvasChartObj),
        ])
    
    fileContainer.appendChild(chartContainer);
    parentContainer.appendChild(fileContainer);
}

/**
 * @param {string} filename
 * @returns {HTMLDivElement}
 */
function createFileContainer(filename){
    const container = document.createElement("div");
    container.id = filename;
    container.className = "file-container";

    //Create header for the container that contains 
    //all the charts associated with a specific file
    const header = document.createElement("div");
    header.className = "file-container-header";
    const title = document.createElement("h3");
    title.textContent = filename;
    
    header.appendChild(title);
    container.appendChild(header);
    
    return container;
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
    const numberOfGatedEventsEle = document.createElement("p");
    numberOfGatedEventsEle.textContent = `Number of Gated Events: 0 Percent Gated: 0%`;

    metaDataContainer.appendChild(numberOfEventsEle);
    metaDataContainer.appendChild(numberOfGatedEventsEle);

    return metaDataContainer;
}

/**
 * @param {FcsEvent[]} fcsEvents
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createMetaDataV2(fcsEvents, canvasChartObj){
    const metaDataContainer = document.createElement("div");
    metaDataContainer.className = "metadata";
    metaDataContainer.id = `${canvasChartObj.canvas.id}-metadata`;

    const numberOfEventsEle = document.createElement("p");
    numberOfEventsEle.textContent = `Number of Events: ${fcsEvents.length}`;
    const numberOfGatedEventsEle = document.createElement("p");
    numberOfGatedEventsEle.textContent = `Number of Gated Events: 0 Percent Gated: 0%`;

    metaDataContainer.appendChild(numberOfEventsEle);
    metaDataContainer.appendChild(numberOfGatedEventsEle);

    return metaDataContainer;
}

/**
 * @param {CanvasChartObj} canvasChartObj
 * @param {Array<HTMLElement>} userInputsAndChartData
 */
function completeChart(canvasChartObj, userInputsAndChartData){
    //Create a container exclusive to the chart to allow the chart to change size dynamically
    //By setting relative height and width values on the container
    const chartContainer = document.createElement("div");
    chartContainer.className = "chart-container";
    chartContainer.id = `${canvasChartObj.canvas.id}-container`;
    chartContainer.appendChild(canvasChartObj.canvas);
    chartContainer.style.gridTemplateRows = userInputsAndChartData.length;
    chartContainer.style.gridRow = `span ${userInputsAndChartData.length}`;
    
    //Create a container for the chart and its associated input/non-input elements
    const completeContainer = document.createElement("div");
    completeContainer.id = `complete-${canvasChartObj.canvas.id}-container`;
    completeContainer.className = "complete-container";
    completeContainer.appendChild(chartContainer);
    for(let i of userInputsAndChartData) completeContainer.appendChild(i);    

    //Create an event listener for the canvas to allow for the removal of the contextmenu 
    //via a click anywhere on the chart
    canvasChartObj.canvas.addEventListener("click", function(e){
        const contextmenu = document.getElementById(`contextmenu-${canvasChartObj.canvas.id}`);
        if(contextmenu!==null) contextmenu.remove();
    })
    
    return completeContainer;
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
            onClick: handleChartClick,
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
                    const gatePoints = this.getDatasetMeta(1).data;
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
 * @param {FcsEvent[]} fcsEvents
 * @param {string} xAxisTitle
 * @param {string} yAxisTitle
 * @returns {chartjs.ChartConfiguration}
 */
function createScatterPlotOptionsV2(fcsEvents, xAxisTitle, yAxisTitle){

    const data = fcsEvents.map(fcsEvent => {return{x:fcsEvent.data.get(xAxisTitle), y:fcsEvent.data.get(yAxisTitle), self:fcsEvent}});
   
    //Return the chart options object
    return {
        type:"scatter",
        data:{
            datasets:[  
                {
                    data:data,
                    radius: 1,
                    hoverRadius: 1,  // No size increase on hover
                    hitRadius: 1,    // Keeps click precision tight
                    hoverBorderWidth: 0,
                    borderWidth: 1
                },
            ]
        },
        options:{
            // responsive:false,
            maintainAspectRatio:false,
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
                    defaultMax:ss.max(data.map(d => d.x)),
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
                        text:xAxisTitle,
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
                    defaultMax:ss.max(data.map(d => d.y)),
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
                        text: yAxisTitle,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            events:["click"],
            onClick: handleChartClick,
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
                    const gatePoints = this.getDatasetMeta(1).data;
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
 * @param {FcsEvent[]} fcsEvents
 * @param {string} xTitle
 * @returns {chartjs.ChartConfiguration}
 */
function createHistogramPlotOptionsV2(fcsEvents, xTitle){

    const binnedData = createBins(fcsEvents, xTitle, 10000);
    console.log(binnedData);
    //Return the chart options object
    return {
        type:"bar",
        data:{
            datasets:[  
                {
                    data:binnedData,
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
                        // stepSize:1,
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
                        text: "Count",
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
 * @param {chartjs.ChartEvent} e
 */
function handleChartClick(e){
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
            gated:false,
            pointRadius:2,
            backgroundColor:"black",
            borderColor:"black",
        }
        this.data.datasets.push(clickedPointsData);
    }
    else{
        const firstPoint = this.getDatasetMeta(1).data[0];
        //Check first if the points overlap enough to considered the same point
        if((x <= firstPoint.x+5 && x >= firstPoint.x-5 ) && (y <= firstPoint.y+5 && y >= firstPoint.y-5)){
            console.log("latest point is within a 5pixel area of the first point, closing gate.");
            this.data.datasets[1].gated = true;
            this.options.onClick = function(e){
                console.log("gate closed already!");
            }
            this.canvas.addEventListener("contextmenu", e=>{
                
                //Prevent the regular custom menu from appearing
                e.preventDefault();
                
                //move pre-exisiting contextmenus instead of making a new one
                const contextmenuId = `contextmenu-${this.canvas.id}`;
                const prevContextMenu = document.getElementById(contextmenuId);
                if(prevContextMenu !== null){
                    prevContextMenu.style.left = e.pageX + "px";
                    prevContextMenu.style.top = e.pageY + "px";
                    return;
                }
                
                //Create custom menu with a single option, to remove the gate if it does not exist already
                const menuContainer = document.createElement("div");
                menuContainer.style.left = e.pageX + "px";
                menuContainer.style.top = e.pageY + "px";
                menuContainer.style.display = menuContainer.style.display === ""?"block":"";
                menuContainer.className = "contextmenu";
                menuContainer.id = `contextmenu-${this.canvas.id}`;
                const button = document.createElement("button");
                button.textContent = "Remove Gate";
                button.addEventListener("click", e =>{
                    if(this.data.datasets.length === 2){
                        this.data.datasets.pop();
                        this.update();    
                    } 
                    document.getElementById(contextmenuId).remove();
                    this.options.onClick = handleChartClick;
                    document.getElementById(`${this.canvas.id}-metadata`).lastChild.textContent = `Number of Gated Events: 0 Percent Gated: 0%`;
                })
                menuContainer.appendChild(button);
                document.body.appendChild(menuContainer);
                return;
            });

        }

        //Add a new a point if the points do not overlap
        this.data.datasets[1].data.push({x:chartX,y:chartY});
        this.data.datasets[1].relativePositions.push({x,y});
    }
    

    this.update();
    
}

/**
 * @param {FcsEvent[]} fcsEvents 
 * @param {string} xTitle 
 * @param {number} numberOfBins
 * @returns {ChartDataObject[]}
 */
function createBins(fcsEvents, xTitle, numberOfBins){
    const data = fcsEvents.map(fcsEvent => fcsEvent.data.get(xTitle));
    const dataMax = ss.max(data);
    const binWidth = Math.ceil(dataMax/numberOfBins);
    /**
     * @type {Map<number, FcsEvent[]>}
     */
    const binned = new Map();
    for(let i = binWidth; i < dataMax+binWidth; i+=binWidth){
        binned.set(i, []);
    }

    const bins = Array.from(binned.keys());
    for(let i = 0; i < fcsEvents.length; i++){
        for (let j = 0; j < bins.length; j++){
            const fcsEvent = fcsEvents[i];
            if(fcsEvent.data.get(xTitle) <= bins[j]) {
                binned.get(bins[j]).push(fcsEvent);
                break;
            };
        }
    }
    const results = [];
    for(let [k,v] of binned.entries()){
        results.push({x:k, y:v.length, self:v});
    }

    return results;
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
    const scatterPlotOptions = type === "scatter" ? createScatterPlotOptions(fcsData):createHistogramPlotOptionsV2(fcsData);
    return {canvas:canvasEle, chart: new chartjs.Chart(canvasEle, scatterPlotOptions)};
}

/**
 * @param {FcsEvent[]} fcsEvents 
 * @param {string} xAxisTitle 
 * @param {string} yAxisTitle - For histogram, pass in "histogram"
 * @returns {CanvasChartObj}
 */
function createChartV2(fcsEvents, xAxisTitle, yAxisTitle){
    const canvasEle = document.createElement("canvas");
    canvasEle.id = `chart-${Math.random()*Math.random()}`;
    const scatterPlotOptions = yAxisTitle === "histogram" ? createHistogramPlotOptionsV2(fcsEvents, xAxisTitle):createScatterPlotOptionsV2(fcsEvents,xAxisTitle, yAxisTitle);
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
 * @param {FcsEvent[]} fcsEvents
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLDivElement}
 */
function createAxisDropDown(xOry, fcsEvents, canvasChartObj){

    const labelEle = document.createElement("label");
    labelEle.textContent = `${xOry}-Axis: `;
    labelEle.setAttribute("for", `${canvasChartObj.canvas.id}-${xOry}-axis-label`);

    const selectEle = document.createElement("select");
    selectEle.id = `${canvasChartObj.canvas.id}-${xOry}-axis-label`;

    for (let xAxisTitle of fcsEvents[0].data.keys()){
        const optionEle = document.createElement("option");
        optionEle.textContent = xAxisTitle;
        optionEle.value = xAxisTitle;
        selectEle.appendChild(optionEle);

        //default labels for the default chart
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
        // const fcsData = getFcsForGraphing(fcsEvents, xOry === "x"?axisTitle:otherAxisTitle, xOry === "y"?axisTitle:otherAxisTitle);
        updateChartData(fcsEvents, xOry === "x"?axisTitle:otherAxisTitle, xOry === "y"?axisTitle:otherAxisTitle, canvasChartObj.chart);
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
 * @param {CanvasChartObj} canvasChartObj
 * @returns {HTMLButtonElement}
 */
function createEnterGateButton(canvasChartObj){
    const button = document.createElement("button");
    button.textContent = "Enter Gate";
    button.className = "gate-button";
    button.addEventListener("click", e =>{
        //If there are no points then return
        if(canvasChartObj.chart.data.datasets.length <= 1) return;
        const gatedPointsDataset = canvasChartObj.chart.data.datasets[1];

        //If there are points but there is no closed gate yet return
        if(!gatedPointsDataset.gated) return;

        //Determine if each point is within the gate and update the UI
        const gatedPoints = gatedPointsDataset.data;
        const eventPoints = canvasChartObj.chart.data.datasets[0].data;
        
        console.log("Gate is closed and ready to be entered!");
        const numOfVertices = gatedPoints.length;
        const withinGateEvents = [];
        for(let eventPoint of eventPoints){
            const {x,y, self} = eventPoint;
            let inside = false;
            let p1 = gatedPoints[0];
            let p2;
            for(let i = 1; i <= numOfVertices; i++){
                //Modulus operator used so that when the index is equal to the numOfVertices p2
                //is set to the first point thereby closing the gate
                p2 = gatedPoints[i%numOfVertices];
                if(y > Math.min(p1.y, p2.y)){
                    if(y <= Math.max(p1.y, p2.y)){
                        if(x <= Math.max(p1.x, p2.x)){
                            const xIntersection = ((y - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y) + p1.x;
                            if(p1.x === p2.x || x <= xIntersection) inside = !inside;
                        }  
                    }
                }
                p1 = p2;
            }
            if(inside) withinGateEvents.push(self);
        }
        document.getElementById(`${canvasChartObj.canvas.id}-metadata`).lastChild.textContent = "Number of Gated Events: " + withinGateEvents.length + " Percent Gated: " + Math.round(withinGateEvents.length/eventPoints.length*100) + "%";

        const gatedChart = createChartV2(withinGateEvents, "SSC-A", "FSC-A", "scatter");
        const completeGatedChart = completeChart(gatedChart, [
            createAxisDropDown("x", withinGateEvents, gatedChart), 
            createAxisDropDown("y", withinGateEvents, gatedChart),
            createLogLinearDropDown("x", gatedChart),
            createLogLinearDropDown("y", gatedChart),
            createMaxMinAxisInput("x", gatedChart),
            createMaxMinAxisInput("y", gatedChart),
            createEnterGateButton(gatedChart),
            createMetaDataV2(withinGateEvents, gatedChart),
        ])

        const parentContainer = document.getElementById(eventPoints[0].self.filename);
        parentContainer.appendChild(completeGatedChart);
    })

    return button;
}

/**
 * @param {FcsParser} parsedFcs -The options object passed into the new FcsParser needs to have 'dataFormat:"asNumber"' property.
 * @param {string} parameterName -The name of the parameter to obtain values from i.e SSC-A, FSC-A, etc.
 * @param {number} numOfEvents -Default value is -1 to indicate all events.
 * @returns {Array<number>}
*/
function getParameterValues(parsedFcs, parameterName, numOfEvents = -1){
    const allChannels = parsedFcs.get$PnX('N');
    const parameterIndex = allChannels.indexOf(parameterName)-1;
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
 * @param {FcsParser} parsedFcs
 * @param {string} filename
 * @returns {FcsEvent[]}
 */
function convertToFcsEventObjs(parsedFcs, filename){
    const allChannels = parsedFcs.get$PnX("N");
    const results = [];
    for(let i = 0; i < parsedFcs.dataAsNumbers.length; i++){
        const eventObj = {
            data:new Map(),
            identifier:i,
            filename:filename
        }
        for(let j = 1; j < allChannels.length; j++){
            eventObj.data.set(allChannels[j], parsedFcs.dataAsNumbers[i][j-1]);
        }
        results.push(eventObj);
    }
    return results;
}

/**
 * @param {FcsEvent[]} fcsEvents
 * @param {string} xTitle
 * @param {string} yTitle
 * @param {chartjs.Chart}chart
 */
function updateChartData(fcsEvents, xTitle, yTitle, chart){
    chart.data.datasets[0].data = fcsEvents.map(fcsEvent => {return{x:fcsEvent.data.get(xTitle), y:fcsEvent.data.get(yTitle), self:fcsEvent}});
    
    //If there was a gate in the chart, remove it when the data is replaced with different x axis and y axis
    if(chart.data.datasets.length === 2) chart.data.datasets.pop();
    chart.options.scales.x.title.text = xTitle;
    chart.options.scales.y.title.text = yTitle;
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