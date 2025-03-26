const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const xlsx = require("xlsx");
const helpers = require("../utils/helpers");
const classes = require("../classes/classes");
const { callback } = require("chart.js/helpers");

//Global variable to store the reference to the created chart & chart image for excel
let LINEGRAPH = null;
let BARGRAPH = null;

/**
 * @typedef {Object} LightweightSample
 * @property {string} wellPosition - The well position the sample was loaded in
 * @property {number} wellNumber - The well number the same was loaded in
 * @property {string} name - The name of the sample
 * @property {number} absorbance - The absorbance value of the sample in the well
 * @property {string} type - The type of the sample
 * @property {string|undefined} unit - The unit of the sample if it is a standard
 */

/**
 * @typedef {Object} RegressionObject
 * @property {Map<string,number>} parameters - The parameters of the regression model, for linear and log its m and b, for 4PL its a,d,c,b
 * @property {number} rSquared - The coerrelation coefficient, the closer to 1 the better the model
 * @property {function} eq - The regression model equation, takes in x, returns y
 * @property {function} invEq - The inverse regression model equation, takes in y returns x
 */

/**
 * @typedef {Object} ParsedData
 * @property {classes.RegressionSample[]} samples
 * @property {string} filename
 * @property {string} templateFilename
 * @property {string[][]} rawdata
 * @property {string[][]} rawTemplate
 * @property {string[][]} template
 * @property {LightweightSample[]} lightweightSamples
 */

/**
 * @typedef {Object} PsuedoExcel
 * @property {number} rows
 * @property {number} columns
 * @property {string[][]} data
 * @property {function} appendCol
 * @property {function} appendRow
 * @property {function} at
 * @property {function} combine
 * @property {function} appendAt
 */


function main(){
    document.getElementById("process-button").addEventListener("click", handleProcess);
    document.getElementById("dilution-factor").addEventListener("input", handleNumericalInput);
    document.getElementById("units-conversion").addEventListener("input", handleConversionInput);
    document.getElementById("rawdata-input").addEventListener("input", updateLabel);
    document.getElementById("template-input").addEventListener("input", updateLabel);
    document.querySelectorAll(".card").forEach(element => element.addEventListener("click", clickedCard))
    Array.from(document.getElementById("x-scale").children)
        .forEach(div=>{
            Array.from(div.children).filter(element=>element.tagName === "INPUT")
            .forEach(element=>element.addEventListener("change", handleXScale));
        });
    document.getElementById("hideExtrapolated").addEventListener("change", handleHideExtrapolated);
}
/**
 * @param {Event} e
 */
function clickedCard(e){
    if(e.target.nodeName === "INPUT") return;
    const className = "clicked-card";
    /**
     * @type {HTMLElement}
    */
   const newlySelectedCard = e.currentTarget;
   
   //Assumes that the 2nd element in the card is the input element (radio or checkbox)
   const inputElement = newlySelectedCard.children.item(1);
   const attr = inputElement.attributes.getNamedItem("name");
   
   
   //This applies to the checkbox for removing extrapolated values from the scatter plot
   if(attr === null){
        inputElement.click();
        newlySelectedCard.classList.contains(className)?newlySelectedCard.classList.remove(className):newlySelectedCard.classList.add(className);
    }
    //This applies to everything else
    else{
        const type = attr.value;

        const currentlySelectedCards = Array.from(document.querySelectorAll("." + className));
        const currentlySelectedCard = currentlySelectedCards.filter(currentlySelectedCard => currentlySelectedCard.querySelector(`input[name="${type}"]`))[0];
        
        if(currentlySelectedCard !== undefined) currentlySelectedCard.classList.remove(className);
        newlySelectedCard.classList.add(className);
        inputElement.click();
    }
}

/**
 * @param {Event} e
 */
function updateLabel(e){
    const selectedFiles = this.files;
    if(selectedFiles.length > 0) this.nextElementSibling.textContent = selectedFiles[0].name;
    else this.nextElementSibling.textContent = "None";
    return null
}

/**
 * @param {InputEvent} e
*/
function handleHideExtrapolated(e){
    if(LINEGRAPH === null) return;
    if(e.target.checked){
        LINEGRAPH.data.datasets.filter(dataset => dataset.label === "Unknowns")[0].data = LINEGRAPH.data.storage.filteredUnknowns;
    }
    else{
        LINEGRAPH.data.datasets.filter(dataset => dataset.label === "Unknowns")[0].data = LINEGRAPH.data.storage.allUnknowns;
    }
    LINEGRAPH.update();
}

/**
 * @param {InputEvent} e
*/
function handleXScale(e){
    if(LINEGRAPH){
        LINEGRAPH.options.scales.x.type = e.target.value;
        LINEGRAPH.update();
    }
}
/**
 * @param {InputEvent} e
*/
function handleNumericalInput(e){
    const value = parseInt(e.target.value);
    if(value < 1 || isNaN(value)){
        this.setCustomValidity("The Value Has To Be Greater Than or Equal to 1");
        this.reportValidity();
        document.getElementById("process-button").removeEventListener("click", handleProcess);
    }
    else{        
        this.setCustomValidity("");
        document.getElementById("process-button").addEventListener("click", handleProcess);
    }
}

/**
 * @param {InputEvent} e
*/
function handleConversionInput(e){
    const masses = ["g", "mg", "ug", "ng", "fg"];
    const volumes = ["L", "mL", "uL", "nL", "fL"];
    const unit = e.target.value;
    if(unit.indexOf("/") < 0){
        document.getElementById("process-button").removeEventListener("click", handleProcess);
        this.setCustomValidity("Enter the units in the correct format, i.e. mass/volume");
        this.reportValidity();
    }
    else{
        this.setCustomValidity("");
        const [mass, volume] = unit.split("/");
        if(masses.indexOf(mass) < 0){
            document.getElementById("process-button").removeEventListener("click", handleProcess);
            this.setCustomValidity("Not a Supported Unit of Mass, i.e. g, mg, ug, ng, fg");
            this.reportValidity();
        }
        else if(volumes.indexOf(volume) < 0){
            document.getElementById("process-button").removeEventListener("click", handleProcess);
            this.setCustomValidity("Not a Supported Unit of Volume, i.e. L, mL, uL, nL, fL");
            this.reportValidity();            
        }
        else{
            document.getElementById("process-button").addEventListener("click", handleProcess);
            this.setCustomValidity("");            
        }
    }
}

/**
 * @param {File} rawdataFile
 * @param {File} templateFile
 * @returns {Promise<ParsedData>}
 */
async function merge(rawdataFile, templateFile){
    const rawdata = await helpers.parseDelimitedFile(rawdataFile);
    const rawTemplate = await helpers.parseDelimitedFile(templateFile);

    /**
     * @type {Map<string, classes.RegressionSample>}
     */
    const samples = new Map();

    /**
     * @type {LightweightSample[]}
     */
    const lightweightSamples = [];

    //Grabs only the raw data assuming the data is in a 96-well plate layout from a SoftMaxPro Optical Plate reader device
    const data = rawdata.slice(3,11).map(row => row.slice(2, 14));

    //Use the filenames' stem
    const filename = rawdataFile.name.split(".")[0];
    const templateFilename = templateFile.name.split(".")[0];

    //Grabs the names in the 96-well template
    const template = rawTemplate.slice(2,10).map(row=>row.slice(1));

    //Iterate through each inner array and create a sample, only adding the sample to the sample list if it doesn't exist already
    const rows = data.length;
    const columns = data[0].length;
    const startingColLetter = "A".charCodeAt(0);
    let wellNumber = 1;
    for(let i = 0; i < rows; i++){
        const columnLetter = String.fromCharCode(startingColLetter + i);
        for(let j = 0; j < columns; j++){
            const wellPosition = columnLetter + (j+1).toString();
            const parsedSample = helpers.parseSampleName(template[i][j]);
            const y = Number(data[i][j]);            
            const name = parsedSample.get("name");
            const type = parsedSample.get("type");

            //Create a light sample object for each item in the template
            lightweightSamples.push({name, wellNumber, wellPosition, type, absorbance:y, unit:parsedSample.get("unit")});

            //Skip over the samples labeled as none
            if(name === "none") continue;

            //Check if the sample object already exists, if it does just add the new info the existing object
            if(samples.has(name)){
                const sample = samples.get(name);
                sample.ys.push(y);
                sample.wellPositions.push(wellPosition);
                sample.wellNumbers.push(wellNumber);
            }
            else{
                if(parsedSample.has("unit")){
                    samples.set(name, classes.createRegressionSample(name, type, parsedSample.get("unit"), [wellPosition], [wellNumber], parsedSample.get("x"), [y]));
                }
                else{
                    samples.set(name, classes.createRegressionSample(name, type, "", [wellPosition], [wellNumber], NaN, [y]));
                }
            }
        }
    }
    //Iterate through the samples after they have all been mapped and add the averageY property
    samples.forEach((v, k, m) => v.averageY = ss.average(v.ys));
    samples.forEach((v, k, m)=> v.stdev = v.ys.length > 1 ? ss.standardDeviation(v.ys) : NaN)

    //Provide the filename so that it can be used to create the results xlsx file
    return {samples, filename, templateFilename, rawdata, template, rawTemplate, lightweightSamples};
}

/**
 * @param {Event} e
 * @returns {null}
 */
function handleProcess(e){
    const rawdataFile = document.getElementById("rawdata-input").files.length >= 0?document.getElementById("rawdata-input").files[0]:null;
    const templateFile = document.getElementById("template-input").files.length >= 0?document.getElementById("template-input").files[0]:null;
    //If there is no template or raw data file selected return
    if(!rawdataFile || !templateFile) return;
    
    //If there is no selected regression type return
    const regressionInputs = document.getElementById("regression-inputs");
    const regressionType = getSelectedRadioButton(regressionInputs);
    if(regressionType === null)return;

    //Get user inputs for x-scale type and regression type
    const xScaleInputs = document.getElementById("x-scale");
    const xScale = getSelectedRadioButton(xScaleInputs);
    if(xScale === null) return;

    //Get whether or not to show extrapolated results
    /**
     * @type {boolean}
     */
    const extrapolated = document.getElementById("hideExtrapolated").checked;

    
    const excelDownloadButton = document.getElementById("download-button");
    const chartCanvas = document.getElementById("regression-chart");
    const tableContainer = document.getElementById("table-container");
    const dilutionFactor = parseInt(document.getElementById("dilution-factor").value);
    const targetUnits = document.getElementById("units-conversion").value;
    const diagramContainer = document.getElementById("template-diagram");
    const gelTableContainer = document.getElementById("gel-table-container");
    const proteinBarChart = document.getElementById("protein-bar-chart");
    
    //Delete current UI elements
    if(LINEGRAPH !== null){
        LINEGRAPH.destroy();
        BARGRAPH.destroy();
        deleteTable(tableContainer, "results-table");
        deleteTable(gelTableContainer, "protein-loading-table");
        excelDownloadButton.replaceWith(excelDownloadButton.cloneNode(true));
        diagramContainer.innerHTML = "";
    } 
    
    merge(rawdataFile, templateFile)
    .then(parsedData =>{
        //Get excel button again since replacing the element requires that a reference to the newly created element is retrieved
        const excelDownloadButton = document.getElementById("download-button");
        const samples = Array.from(parsedData.samples.values());
        const standards = samples.filter(sample => sample.type === "standard");
        const unknowns = samples.filter(sample => sample.type === "sample");
        
        const xAndYStandards = standards.map(standard => [standard.x, standard.averageY]);
        let regressionObject;

        //Create a 96 well diagram of the template on the UI
        diagram96Well(parsedData.lightweightSamples, diagramContainer, parsedData.templateFilename);
        

        //Obtain the parameters of best fit using selected regression type
        if(regressionType === "log") regressionObject = getLogRegression(xAndYStandards);
        else if(regressionType === "linear") regressionObject = getLinearRegression(xAndYStandards);
        else regressionObject = get4ParameterHillRegression(xAndYStandards);
        const {parameters, rSquared, eq, invEq} = regressionObject;

        //Sort standards from highest to lowest according to the average Y
        standards.sort((first, second)=>second.averageY-first.averageY);
        //Sort unknowns from lowest to highest according to the average Y
        unknowns.sort((first, second)=>first.averageY-second.averageY);
        //Assume that all the standards have the same unit & assign that unit to all the unknowns
        const unit = standards[0].unit;
        
        //Interpolate the concentration of all the samples using the regression model generated
        for(let sample of samples){
            sample.interpolatedX = invEq(sample.averageY);
            sample.dilutionFactor = dilutionFactor;
            sample.undilutedX = sample.interpolatedX*dilutionFactor;
            sample.unit = unit;
            sample.targetUnit = targetUnits;
            sample.convertedX = helpers.convertConcentration(sample.undilutedX, unit, targetUnits);
        };
        
        
        //Create regression graph, protein bar graph & table
        const regressionChartContainer = document.getElementById("regression-chart-container");
        const barChartContainer = document.getElementById("bar-chart-container");
        regressionChartContainer.style.height = "70vh";
        regressionChartContainer.style.width = "48vw";
        barChartContainer.style.height = "60vh";
        barChartContainer.style.width = "98vw";
        LINEGRAPH = new chartjs.Chart(chartCanvas,createChartOptionsAndData(unknowns, standards, rSquared, xScale, unit, parsedData.filename, eq, regressionType, extrapolated));
        BARGRAPH = new chartjs.Chart(proteinBarChart, createBarChartOptionsAndData(unknowns, parsedData.filename));
        createRegressionResultsTable(unknowns,standards,tableContainer, unit, targetUnits, dilutionFactor);
        createProteinGelLoadingTable(unknowns, gelTableContainer);
        
        //Add functionality to the excel button
        excelDownloadButton.addEventListener("click", (e)=>handleExcelDownload(e,parsedData, standards, unknowns, dilutionFactor, unit, targetUnits, parameters, rSquared));

    })
}
/**
 * @param {Event} e
 * @param {ParsedData} parsedData
 * @param {Sample[]} standards
 * @param {Sample[]} unknowns
 * @param {number} dilutionFactor
 * @param {string} unit
 * @param {string} targetUnit
 * @param {Map<string, number>} parameters
 * @param {number} rSquared
 */
function handleExcelDownload(e, parsedData, standards, unknowns, dilutionFactor, unit, targetUnit, parameters, rSquared){
    //Create pseudoExcels in memory in order to write to excel and create downloadable link
    const psuedoExcel = createPsuedoExcel(null, null, parsedData.rawdata);
    psuedoExcel.combine(createPsuedoExcel(null, null, parsedData.template), 3, 2, false);
    const startingCol = psuedoExcel.columns;
    
    //Add headers
    const [mass, vol] = targetUnit.split("/");
    const headers = [
        "Name", 
        "Type", 
        "Replicate Well Values", 
        "Average(Stdev)",
        `Concentration [${unit}]`,
        `${dilutionFactor}X Concentration [${unit}]`,
        `${dilutionFactor}X Concentration [${targetUnit}]`,
        `Protein[${mass}]/Well`,
        `Vol[${vol}]/Well`,
        `Protein Vol[${vol}]/Well`,
        `4X Laemmli Vol[${vol}]/Well`,
        `H2O Vol[${vol}]/Well`,
        `Replicates`,
        `Replicate Vol[${vol}]`,
        `Replicate Protein Vol[${vol}]/Well`,
        `Replicate 4X Laemmli Vol[${vol}]/Well`,
        `Replicate H2O Vol[${vol}]/Well`,
    ]
    psuedoExcel.appendAt(0, psuedoExcel.columns, true, headers);
    standards.forEach((standard, i, arr) => psuedoExcel.appendAt(i+1, startingCol, true, standard.getExcelData()));
    unknowns.forEach((unknown, i, arr) => psuedoExcel.appendAt(standards.length+i+1, startingCol, true, unknown.getExcelData()));

    //Add regression model parameters of best fit to pseudoExcel
    psuedoExcel.appendCol(psuedoExcel.columns, [""]);
    psuedoExcel.appendCol(psuedoExcel.columns,["R-Squared", ...Array.from(parameters.keys()), "Dilution Factor"]);
    psuedoExcel.appendCol(psuedoExcel.columns,[rSquared, ...Array.from(parameters.values()), dilutionFactor]);


    //create an excel file in memory with the desired data
    const wkbk = createWkbk(psuedoExcel.data, "results");
    appendWorksheet(wkbk, parsedData.rawdata, "rawdata");
    appendWorksheet(wkbk, parsedData.rawTemplate, "template");

    const binaryData = xlsx.write(wkbk, {bookType:"xlsx", type:"buffer"});
    const blob = new Blob([binaryData], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    
    //Create a download link and associated anchor element
    const link = window.URL.createObjectURL(blob);
    const anchorElem = document.createElement("a");
    anchorElem.href = link;
    anchorElem.download = parsedData.filename+".xlsx";

    //Prevent the bubbling of the click event that is initiated when the parent button element is clicked
    anchorElem.addEventListener("click", e => e.stopPropagation())
    anchorElem.click();

    //Clean up
    window.URL.revokeObjectURL(link)
}

/**
 * @param {HTMLDivElement} container
 * @param {boolean} valueOnly
 * @returns {string|null}
 */
function getSelectedRadioButton(container){
    const radioDivs = Array.from(container.querySelectorAll(".radio"));
    for(let radioDiv of radioDivs){
        for(let child of radioDiv.children){
            //Return as soon as the first checked radio button is found
            if(child.tagName === "INPUT" && child.checked === true) return child.defaultValue;
        }
    }
    return null
}

/**
 * @param {HTMLDivElement} container  - The container that contains the table
 * @param {string} id  - The id of the table
 * @returns {null}
*/
function deleteTable(container, id){
    const table = document.getElementById(id);
    if(table) container.removeChild(table);   
    return null;
}

/**
 * @param {classes.RegressionSample[]} unknowns - A list of sample objects to display in the table
 * @param {classes.RegressionSample[]} standards - A list of sample objects to display in the table
 * @param {string} units - The units of the samples
 * @param {string} convertedUnits - The converted units of the samples
 * @param {string} dilutionFactor - The dilution factor of the samples
 * @param {Element} container - The element to append the table element to as a child
 * @returns {null}
 */
function createRegressionResultsTable(unknowns, standards, container, units, convertedUnits, dilutionFactor){
    //Create table element
    const table = document.createElement("table");
    table.id = "results-table";

    //Create table title
    const title = document.createElement("caption");
    title.textContent = "Regression Model Results";
    table.appendChild(title);

    //Create column headers
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = [
        "Name",
        "Type",
        "Wells",
        "Individual Values",
        "Average (StDev)",
        `Concentration [${units}]`,
        `${dilutionFactor}X Concentration [${units}]`,
        `${dilutionFactor}X Concentration [${convertedUnits}]`,
    ];
    for(let header of headers){
        const headerTitle = document.createElement("th");
        headerTitle.textContent = header;
        headerRow.appendChild(headerTitle);
    }
    headerContainer.className = "headers";
    //Create table body
    const body = document.createElement("tbody");
    headerContainer.appendChild(headerRow);

    //Determine the lowest & highest standard in order to change the text to red if the sample is outside the standard curve 
    // const standardYs = standards.map(standard => standard.averageY);
    // const lowest = ss.min(standardYs);
    // const highest = ss.max(standardYs);

    //The standards should've been sorted already in the outer function
    const lowest = standards.at(-1).averageY;
    const highest = standards.at(0).averageY;
    
    for(let standard of standards){        
        const row = document.createElement("tr");
        for (let [k, v] of standard.getTableData().entries()){
            const td = document.createElement("td");
            td.className = k
            if(k === "type"){
                const div = document.createElement("div");
                div.className = `${v} bubble`;
                div.textContent = v;
                td.appendChild(div);
            }
            else{
                td.textContent = v;
            }
            row.appendChild(td);
        }
        row.className = `${standard.name}`;
        body.appendChild(row);
    };

    for(let unknown of unknowns){       
        const row = document.createElement("tr");
        
        for (let [k, v] of unknown.getTableData().entries()){
            const td = document.createElement("td");
            td.className = k
            if(k === "type"){
                const div = document.createElement("div");
                div.className = `${v} bubble`;
                div.textContent = v;
                td.appendChild(div);
            }
            else{
                td.textContent = v;
            }
            row.appendChild(td);
        }

        //If unknown y value is outside the standard curve change text to red
        row.className = (unknown.averageY <= lowest || unknown.averageY >= highest) ? `${unknown.name} extrapolated` : `${unknown.name}`
        body.appendChild(row);
    }
    
    table.style.height = unknowns.length <= 16 ? "auto": "50vh";
    table.appendChild(headerContainer);
    table.appendChild(body);
    container.appendChild(table);
}



/**
 * @param {classes.RegressionSample[]} unknowns
 * @param {classes.RegressionSample[]} standards
 * @param {number} rSquared
 * @param {string} xScale
 * @param {string} unit
 * @param {string} title
 * @param {CallableFunction} eq
 * @param {string} regressionType
 * @param {boolean} extrapolated
 * @returns {chartjs.ChartConfiguration}
 */
function createChartOptionsAndData(unknowns, standards, rSquared, xScale, unit, title, eq, regressionType, extrapolated){
    const standardYs = standards.map(standard => standard.averageY);
    const maxY = ss.max(standardYs);
    const minY = ss.min(standardYs);

    //Give regression model line a smooth curve if regression type is 4PL
    if(regressionType === "4pl"){
        const standardXs = standards.map(standard => standard.x);
        const minX = ss.min(standardXs);
        const maxX = ss.max(standardXs);
        const minMaxDiff = (maxX-minX)/1000;
        var mockData = [{x:minX, y:minY}];
    
        for(let i = 0; i < 1000; i++){
            const mockX = mockData[i].x + minMaxDiff;
            const mockY = eq(mockX);
            mockData.push({x:mockX, y:mockY});
        }
    }
    const allUnknowns = unknowns.map(unknown => {return {x:unknown.interpolatedX.toFixed(), y:unknown.averageY.toFixed(2)}});
    const filteredUnknowns = unknowns.map(unknown => {return unknown.averageY <= maxY && unknown.averageY >= minY ? {x:unknown.interpolatedX, y:unknown.averageY}:{x:null, y:null}});
    //Return the chart options object
    return {
        type:"scatter",
        data:{
            storage:{
                allUnknowns: allUnknowns,
                filteredUnknowns: filteredUnknowns,
            },
            datasets:[  
                {
                    labels:standards.map(standard => standard.name),
                    label:"Standards",
                    data:standards.map(standard => {return {x:standard.x.toFixed(2), y:standard.averageY.toFixed(2)}}),
                    pointBackgroundColor:"#D6EFD8",
                    pointBorderColor:"black"
                },
                {
                    labels:unknowns.map(unknown => unknown.name),
                    label:"Unknowns",
                    data: extrapolated?filteredUnknowns:allUnknowns,
                    pointBorderColor:"black",
                    pointBackgroundColor:"#ff69695c",
                },
                {
                    labels:standards.map(standard => standard.name),
                    label:`Regression Model: R-Squared: ${rSquared.toFixed(2)}`,
                    data: regressionType === "4pl"?mockData:standards.map(standard => {return {x:standard.interpolatedX.toFixed(2), y:standard.averageY.toFixed(2)}}),
                    showLine:true,
                    // pointBorderColor: "black",
                    // pointBackgroundColor:"#F2B949",
                    // borderColor:"#F2B949",
                    pointRadius:regressionType === "4pl"?0:3,
                },
            ]
        },
        options:{
            maintainAspectRatio:false,
            scales:{
                x:{
                    type:xScale,
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
                        text:`Protein Concentration [${unit}]`,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black",
                    },
                    
                },
                y:{
                    beginAtZero:true,
                    position:"left",
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
                        text:"Absorbance",
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            plugins:{
                title:{
                    display:true,
                    text: title,
                    font:{
                        size:16,
                    },
                    color: "black",
                },
                legend:{
                    labels:{
                        color:"black"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const label = ctx.dataset.labels[ctx.dataIndex];
                            return label + " (" + ctx.parsed.x + ", " + ctx.parsed.y + ")";
                        },
                    },
                },
            },
        }
    }
}
/**
 * @param {Sample[]} unknowns
 * @param {string} title
 * @returns {chartjs.ChartConfiguration}
 */
function createBarChartOptionsAndData(unknowns, title){
    const sorted = unknowns.map(unknown => {
        return {
            name:unknown.name, 
            concentration:unknown.convertedX,
        }
    }).sort((a,b) => a.concentration - b.concentration);

    return {
        type:"bar",
        data:{
            labels:sorted.map(x => x.name),
            datasets:[
                {
                    label:`Concentration [${unknowns[0].targetUnit}]`,
                    data:sorted.map(x=>x.concentration),
                    backgroundColor:"rgba(255, 105, 105, 0.9)",
                    borderColor:"black",
                    borderWidth: 1,
                }
            ]
        },
        options:{
            maintainAspectRatio:false,
            scales:{
                x:{
                    grid:{
                        color:"black",
                        tickColor:"black",
                    },
                    ticks:{
                        textStrokeColor:"black",
                        color:"black",
                    },
                    
                },
                y:{
                    position:"left",
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
                        text:`Protein Concentration [${unknowns[0].targetUnit}]`,
                        font:{
                            size:18,
                            weight:"bold",
                        },
                        color: "black", 
                    },
                               
                },
            },
            plugins:{
                title:{
                    display:true,
                    text: title,
                    font:{
                        size:20,
                    },
                    color: "black",
                },
                legend:{
                    display:false,
                }

            },
        }
    }
}
/**
 * @param {string[][]} data
 * @param {string} sheetname
 * @returns {xlsx.WorkBook}
 */
function createWkbk(data, sheetname = "sheet1"){
    const wkbk = xlsx.utils.book_new();
    const wkst = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wkbk, wkst, sheetname);
    return wkbk;
}

/**
 * @param {xlsx.WorkBook} wkbk
 * @param {string[][]} data
 * @param {string} wkstName
 * @param {string} image
 * @returns {null}
 */
function appendWorksheet(wkbk, data, wkstName, image = null){
    if(image !== null){
        wkbk.Sheets["graph"]["!images"] = [
            {
                name: 'image1.jpg',
                data: image,
                opts: { base64: true },
                position: {
                    type: 'twoCellAnchor',
                    attrs: { editAs: 'oneCell' },
                    from: { col: 2, row : 2 },
                    to: { col: 6, row: 5 }
                }
            }
        ]
        return null;
    }
    const wkst = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wkbk, wkst, wkstName);
    return null;
}


/**
 * @param {number} rows
 * @param {number} columns
 * @param {string[][]} startingData
 * @returns {PsuedoExcel}
 */
function createPsuedoExcel(rows, columns, startingData = null){
    let data; 

    if(startingData && startingData.length !== 0){
        data = structuredClone(startingData);
        rows = startingData.length;
        columns = ss.max(startingData.map(inner => inner.length));
    }
    else{
        data = [];
        for (let i = 0; i < rows; i++) data.push(new Array(columns).fill(null));
    }

    /**
     * @param {number} row
     * @param {number} column
     * @param {number|string|boolean} val
     * @returns {string|null}
     */
    function at(row, column, val){
        while(this.rows <= row) {
            this.data.push(new Array(column+1).fill(null));
            this.rows+=1;
        };
        const currentRow = this.data[row];
        while(currentRow.length <= column){ 
            currentRow.push(null);
        };
        if(this.columns < currentRow.length) this.columns = currentRow.length;
        if(val) this.data[row][column] = val.toString();
        else return this.data[row][column];
        
    }

    /**
     * @param {string[]|number[]|boolean[]} data
     * @returns {number} - Returns the new number of total rows
     */
    function appendRow(data){
        this.data.push(data.map(val => val.toString()));
        this.rows+=1;
        return this.rows;
    }
    
    /**
     * @param {number} startingCol
     * @param {string[]|number[]|boolean[]} data
     * @returns {number} - Returns the new number of total columns
     */
    function appendCol(startingCol = null, data){
        if(!startingCol) startingCol = this.columns;
        for(let i = 0; i < data.length; i++){
            this.at(i, startingCol, data[i]);
        };
        return this.columns;
    }

    /**
     * @param {PsuedoExcel} psuedoExcel
     * @param {boolean} overwrite
     * @param {number} startingRow
     * @param {number} startingCol
     * @param {string} seperator
     * @returns {ThisType<PsuedoExcel>} 
     */
    function combine(psuedoExcel, startingRow = 0, startingCol = 0, overwrite = true, seperator = ":"){
        const newData = psuedoExcel.data;
        if(overwrite){
            for(let row = 0; row < newData.length; row++){
                for(let col = 0; col < newData[row].length; col++){
                    this.at(startingRow+row,startingCol+col, newData[row][col]);
                }
            }
        }
        else{    
            for(let row = 0; row < newData.length; row++){
                for(let col = 0; col < newData[row].length; col++){
                    const currentVal = this.at(startingRow+row,startingCol+col);
                    if(currentVal) this.at(startingRow+row,startingCol+col, currentVal + seperator + newData[row][col])
                    else this.at(startingRow+row,startingCol+col, newData[row][col]);
                }
            }
        }
        return this;
    }

    /**
     * @param {number} startingRow
     * @param {number} startingCol
     * @param {boolean} horizontal
     * @param {boolean} overwrite
     * @param {string[]|number[]|boolean[]} data
     * @returns {null}
     */
    function appendAt(startingRow, startingCol, horizontal, data){
        if(horizontal){
            for(let i = 0; i < data.length; i++){
                this.at(startingRow, startingCol+i, data[i]);
            }
        }
        else{
            for(let i = 0; i < data.length; i++){
                this.at(startingRow+i, startingCol, data[i]);
            }            
        }
    }



    return {
        rows,
        columns,
        data,
        appendRow,
        appendCol,
        at,
        combine,
        appendAt,
    }
}



/** 
 * @param {LightweightSample[]} lightSamples
 * @param {Element} parent
 * @param {string} diagramTitle
**/
function diagram96Well(lightSamples, parent, diagramTitle){
    const title = document.createElement("h3");
    title.id = "diagram-title";
    title.textContent = diagramTitle;
    parent.appendChild(title);
    for(let lightSample of lightSamples){
        const well = createWell(lightSample);
        parent.appendChild(well);
    }
}

/**
 * @param {LightweightSample} lightSample
 * @returns {HTMLDivElement}
 */
function createWell(lightSample){
    //Create HTML Elements to add to DOM
    const well = document.createElement("div");
    const wellPosition = document.createElement("p");
    const hoverContainer = document.createElement("div");

    const hoverNameId = `well ${lightSample.wellPosition} name`;
    const hoverNameLabel = document.createElement("span");
    const hoverName = document.createElement("div");
    hoverName.id = hoverNameId;
    
    const hoverAbsId = `well ${lightSample.wellPosition} absorbance`;
    const hoverAbsLabel = document.createElement("span");
    const hoverAbs = document.createElement("div");
    hoverAbs.id = hoverAbsId;

    //Add text content
    hoverNameLabel.textContent = "Name:";
    hoverAbsLabel.textContent = "Abs:";
    hoverName.defaultValue = lightSample.name;
    wellPosition.textContent = lightSample.wellPosition;
    hoverName.textContent = lightSample.name;
    hoverAbs.textContent = lightSample.absorbance.toFixed(2);

    //Add class names
    hoverContainer.className = "hovertext";
    well.className = lightSample.type === "none" ? 
                    `well ${lightSample.wellPosition}` 
                    : 
                    `well ${lightSample.type} ${lightSample.wellPosition} ${lightSample.name}`;

    // Append to the well, div element
    hoverContainer.appendChild(hoverNameLabel);
    hoverContainer.appendChild(hoverName);
    hoverContainer.appendChild(hoverAbsLabel);
    hoverContainer.appendChild(hoverAbs);

    well.appendChild(hoverContainer);
    well.appendChild(wellPosition);

    return well;
}


/** 
 * @param {classes.RegressionSample[]} unknowns
 * @param {Element} parent
**/
function createProteinGelLoadingTable(unknowns, parent){
    //Starting values, these are relatively arbitrary 
    const proteinPerWell = 20;
    const volPerWell = 12;

    const unit = unknowns[0].targetUnit;
    const [mass, vol] = unit.split("/");
    const dilutionFactor = unknowns[0].dilutionFactor;
    const replicates = unknowns[0].sdspageValues.replicates;

    //Create table element to hold subsequent elements
    const table = document.createElement("table");
    table.id = "protein-loading-table";

    //Create table title
    const title = document.createElement("caption");
    title.textContent = "SDS-PAGE Loading Table"

    //Create replicates input to add later in the corresponding header
    const replicatesInput = document.createElement("input");
    replicatesInput.type = "number";
    replicatesInput.id = "replicates";
    replicatesInput.defaultValue = 1;
    
    //Create input element and attach input event handler to update all replicates for samples simulatenously 
    replicatesInput.addEventListener("input", e=>{
        const replicates = parseFloat(e.target.value);
        if(replicates < 0 || isNaN(replicates)) return;

        for(let unknown of unknowns){
            //Perform Calculations
            const replicateVol = unknown.sdspageValues.volPerWell * replicates;
            const replicateProteinVol = unknown.sdspageValues.proteinVolPerWell * replicates;
            const replicateLaemmliVol = unknown.sdspageValues.laemmliVolPerWell * replicates;
            const replicateBufferVol = unknown.sdspageValues.bufferVolPerWell * replicates;
            
            //Update Sample object
            unknown.sdspageValues.replicates = replicates;
            unknown.sdspageValues.replicateVol = replicateVol;
            unknown.sdspageValues.replicateProteinVol = replicateProteinVol;
            unknown.sdspageValues.replicateLaemmliVol = replicateLaemmliVol;
            unknown.sdspageValues.replicateBufferVol = replicateBufferVol;
            
            //Update UI
            document.getElementById(`Replicates-${unknown.name}`).value = replicates;
            document.getElementById(`Vol[${vol}]-${unknown.name}`).textContent = replicateVol.toFixed(2);
            document.getElementById(`Protein Vol[${vol}]-${unknown.name}`).textContent = replicateProteinVol.toFixed(2);
            document.getElementById(`4X Laemmli Vol[${vol}]-${unknown.name}`).textContent = replicateLaemmliVol.toFixed(2);
            document.getElementById(`H2O Vol[${vol}]-${unknown.name}`).textContent = replicateBufferVol.toFixed(2);
        }
        
    })

    //Create input element and attach input event handler to update all protein per well for samples simulatenously 
    const proteinPerWellInput = document.createElement("input");
    proteinPerWellInput.type = "number";
    proteinPerWellInput.id = "protein-per-well-all";
    proteinPerWellInput.defaultValue =  20;
    proteinPerWellInput.addEventListener("input", e => {
        const proteinPerWell = parseFloat(e.target.value);
        if(proteinPerWell < 0 || isNaN(proteinPerWell)) return;
        for(let unknown of unknowns){

            //Perform calculations
            const proteinVolPerWell = proteinPerWell/unknown.convertedX;
            const bufferVolPerWell = unknown.sdspageValues.volPerWell - proteinVolPerWell - unknown.sdspageValues.laemmliVolPerWell;

            //Update Sample object
            unknown.sdspageValues.proteinPerWell = proteinPerWell;
            unknown.sdspageValues.proteinVolPerWell = proteinVolPerWell;
            unknown.sdspageValues.bufferVolPerWell = bufferVolPerWell;

            //Update UI
            document.getElementById(`Protein[${mass}]/Well-${unknown.name}`).value = proteinPerWell;
            // document.getElementById(`Protein Vol[${vol}]/Well-${unknown.name}`).textContent = proteinVolPerWell.toFixed(2);
            // document.getElementById(`H2O[${vol}]/Well-${unknown.name}`).textContent = bufferVolPerWell.toFixed(2);
            document.getElementById(`Replicates-${unknown.name}`).dispatchEvent(new InputEvent("input", {data:unknown.sdspageValues.replicates}));
        }
    })
    
    //Create input element and attach input event handler to update all vol per well for samples simulatenously 
    const volPerWellInput = document.createElement("input");
    volPerWellInput.type = "number";
    volPerWellInput.id = "vol-per-well-all";
    volPerWellInput.defaultValue = 12;
    volPerWellInput.addEventListener("input", e => {
        const volPerWell = parseFloat(e.target.value);
        if(volPerWell < 0 || isNaN(volPerWell)) return;
        for(let unknown of unknowns){
            //Perform calculations
            const laemmliVolPerWell = volPerWell/4;
            const bufferVolPerWell = volPerWell - laemmliVolPerWell - unknown.sdspageValues.proteinVolPerWell;
            
            //Update Sample object
            unknown.sdspageValues.volPerWell = volPerWell;
            unknown.sdspageValues.laemmliVolPerWell = laemmliVolPerWell;
            unknown.sdspageValues.bufferVolPerWell = bufferVolPerWell;
            
            //Update UI
            document.getElementById(`Vol[${vol}]/Well-${unknown.name}`).value = volPerWell;
            // document.getElementById(`4X Laemmli Vol[${vol}]/Well-${unknown.name}`).textContent = laemmliVolPerWell.toFixed(2);
            // document.getElementById(`H2O[${vol}]/Well-${unknown.name}`).textContent = bufferVolPerWell.toFixed(2);
            document.getElementById(`Replicates-${unknown.name}`).dispatchEvent(new InputEvent("input", {data:unknown.sdspageValues.replicates}));
        }
    })


    table.appendChild(title);

    //Create table header row
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = [
        "Name", 
        `${dilutionFactor}X Concentration [${unit}]`,
        `Protein[${mass}]/Well`,
        `Vol[${vol}]/Well`,
        "Replicates",
        `Vol[${vol}]`,
        `Protein Vol[${vol}]`,
        `4X Laemmli Vol[${vol}]`,
        `H2O Vol[${vol}]`,
    ];

    for(let header of headers){
        const headerTitle = document.createElement("th");
        headerTitle.textContent = header;
        if(header === "Replicates"){
            headerTitle.appendChild(replicatesInput);
            headerTitle.className = "editable";
        }
        else if(header === `Protein[${mass}]/Well`){
            headerTitle.appendChild(proteinPerWellInput);
            headerTitle.className = "editable";
        }
        else if(header === `Vol[${vol}]/Well`){
            headerTitle.appendChild(volPerWellInput);
            headerTitle.className = "editable";
        }
        headerRow.appendChild(headerTitle);
    }
    headerContainer.className = "headers";
    headerContainer.appendChild(headerRow);
    
    //Create table body and rows
    const body = document.createElement("tbody");
    for(let unknown of unknowns){        
        const row = document.createElement("tr");
        row.className = `SDS-PAGE ${unknown.name}`;
        const gelData = [unknown.name, unknown.convertedX.toFixed(2), ...unknown.sdspageValues.getGelData()];

        //Ensure that both the headers array and the amount of values for each row are the same in length
        if(headers.length !== gelData.length){
            console.log("The length of the headers is greater than the length of the gel data array.");
            return;
        }

        //Create the rows in each table & add event listeners to the correct cells according to the header
        for(let i  = 0; i < headers.length; i++){
            const data = gelData[i];
            const header = headers[i];
            const td = document.createElement("td");
            if(header === `Protein[${mass}]/Well`){
                const input = document.createElement("input");
                input.id = `${header}-${unknown.name}`;
                input.type = "number";
                input.value = proteinPerWell;
                unknown.sdspageValues.proteinPerWell = proteinPerWell;
                input.addEventListener("input", e => handleTotalProteinChange(e, unknown, mass, vol));
                input.addEventListener("click", handleInputClick);
                td.appendChild(input)
            }
            else if(header === `Vol[${vol}]/Well`){
                const input = document.createElement("input");
                input.id = `${header}-${unknown.name}`;
                input.value = volPerWell;
                input.type = "number";
                unknown.sdspageValues.volPerWell = volPerWell;
                input.addEventListener("input", e => handleWellVolChange(e, unknown, vol));
                input.addEventListener("click", handleInputClick);
                td.appendChild(input);
            }
            else if (header === "Replicates"){
                const input = document.createElement("input");
                input.id = `${header}-${unknown.name}`;
                input.value = replicates;
                input.type = "number";
                unknown.sdspageValues.replicates = replicates;
                input.addEventListener("input", e => handleReplicateChange(e, unknown, vol, mass));
                input.addEventListener("click", handleInputClick);
                td.appendChild(input);
            }
            else{
                td.textContent = data;
                td.id = `${header}-${unknown.name}`
            }
            row.appendChild(td);
        }
        row.addEventListener("click", e =>{
            row.className = row.className === ""?"clicked-row":""; 
        })
        body.appendChild(row);
    }
                        
    //Add elements to table
    table.style.height = unknowns.length <= 16 ? "auto": "50vh";
    table.appendChild(headerContainer);
    table.appendChild(body);
    
    //Add table to the parent container
    parent.appendChild(table);
                        
    for(let unknown of unknowns){
        const laemmliConcentration = 4;

        //Calculate first for a single replicate
        const proteinVol = (proteinPerWell/unknown.convertedX);
        const laemmliVol = (volPerWell/laemmliConcentration);
        const bufferVol = (volPerWell - proteinVol - laemmliVol);
        
        //Calculate for replicates
        const replicateProteinVol = proteinVol * replicates;
        const replicateLaemmliVol = laemmliVol * replicates;
        const replicateBufferVol = bufferVol * replicates;
        const replicateVol = volPerWell * replicates;

        //Set the properties of the unknown equal to the calculated values
        unknown.sdspageValues.proteinPerWell = proteinPerWell;
        unknown.sdspageValues.proteinVolPerWell = proteinVol;
        unknown.sdspageValues.laemmliVolPerWell = laemmliVol;
        unknown.sdspageValues.bufferVolPerWell = bufferVol;
        unknown.sdspageValues.replicates = replicates;
        unknown.sdspageValues.replicateVol = replicateVol;
        unknown.sdspageValues.replicateProteinVol = replicateProteinVol;
        unknown.sdspageValues.replicateLaemmliVol = replicateLaemmliVol;
        unknown.sdspageValues.replicateBufferVol = replicateBufferVol;
        
        //Update the UI
        document.getElementById(`Protein[${mass}]/Well-${unknown.name}`).textContent = proteinPerWell.toFixed(2);
        document.getElementById(`Vol[${vol}]/Well-${unknown.name}`).textContent = volPerWell.toFixed(2);
        // document.getElementById(`Protein Vol[${vol}]/Well-${unknown.name}`).textContent = proteinVol.toFixed(2);
        // document.getElementById(`4X Laemmli Vol[${vol}]/Well-${unknown.name}`).textContent = laemmliVol.toFixed(2);
        // document.getElementById(`H2O[${vol}]/Well-${unknown.name}`).textContent = bufferVol.toFixed(2);
        document.getElementById(`Vol[${vol}]-${unknown.name}`).textContent = replicateVol.toFixed(2);
        document.getElementById(`Protein Vol[${vol}]-${unknown.name}`).textContent = replicateProteinVol.toFixed(2);
        document.getElementById(`4X Laemmli Vol[${vol}]-${unknown.name}`).textContent = replicateLaemmliVol.toFixed(2);
        document.getElementById(`H2O Vol[${vol}]-${unknown.name}`).textContent = replicateBufferVol.toFixed(2);
    }
    
}

/**
 * 
 * @param {Event} e 
 * @param {classes.RegressionSample} unknown 
 * @param {string} mass
 * @param {string} vol 
 * @returns 
 */
function handleTotalProteinChange(e, unknown, mass, vol){
    e.stopPropagation();
    e.preventDefault();
    const proteinPerWell = parseFloat(e.target.value);
    if(proteinPerWell < 0 || isNaN(proteinPerWell)) return;

    //Perform Calculations
    const proteinVolPerWell = proteinPerWell/unknown.convertedX;;
    const laemmliVolPerWell = unknown.sdspageValues.volPerWell/4;
    const bufferVolPerWell = unknown.sdspageValues.volPerWell - laemmliVolPerWell - proteinVolPerWell;

    //Update Sample object
    unknown.sdspageValues.proteinPerWell = proteinPerWell;
    unknown.sdspageValues.proteinVolPerWell = proteinVolPerWell;
    unknown.sdspageValues.laemmliVolPerWell = laemmliVolPerWell;
    unknown.sdspageValues.bufferVolPerWell = bufferVolPerWell;
    
    //Update UI
    // document.getElementById(`Protein Vol[${vol}]/Well-${unknown.name}`).textContent = proteinVolPerWell.toFixed(2);
    // document.getElementById(`4X Laemmli Vol[${vol}]/Well-${unknown.name}`).textContent = laemmliVolPerWell.toFixed(2);
    // document.getElementById(`H2O[${vol}]/Well-${unknown.name}`).textContent = bufferVolPerWell.toFixed(2);
    document.getElementById(`Replicates-${unknown.name}`).dispatchEvent(new InputEvent("input", {data:unknown.sdspageValues.replicates}));
}

/**
 * @param {Event} e 
 * @param {classes.RegressionSample} unknown 
 * @param {string} vol 
 * @returns 
 */
function handleWellVolChange(e, unknown, vol){
    e.stopPropagation();
    e.preventDefault();
    const volPerWell = parseFloat(e.target.value);
    if(volPerWell < 0 || isNaN(volPerWell) ) return;

    //Perform Calculations
    const laemmliVolPerWell = volPerWell/4;
    const bufferVolPerWell = volPerWell - laemmliVolPerWell - unknown.sdspageValues.proteinVolPerWell;
    
    //Update Sample object
    unknown.sdspageValues.volPerWell = volPerWell;
    unknown.sdspageValues.laemmliVolPerWell = laemmliVolPerWell;
    unknown.sdspageValues.bufferVolPerWell = bufferVolPerWell;

    //Update UI
    // document.getElementById(`Vol[${vol}]/Well-${unknown.name}`).textContent = volPerWell.toFixed(2);
    // document.getElementById(`4X Laemmli Vol[${vol}]/Well-${unknown.name}`).textContent = laemmliVolPerWell.toFixed(2);
    // document.getElementById(`H2O[${vol}]/Well-${unknown.name}`).textContent = bufferVolPerWell.toFixed(2);
    document.getElementById(`Replicates-${unknown.name}`).dispatchEvent(new InputEvent("input", {data:unknown.sdspageValues.replicates}));
}
/**
 * @param {Event}
 */
function handleInputClick(e){
    e.preventDefault();
    e.stopPropagation();
}

/**
 * @param {Event} e 
 * @param {classes.RegressionSample} unknown 
 * @param {string} vol 
 * @param {string} mass 
 * @returns
 */
function handleReplicateChange(e, unknown, vol, mass){
    e.stopPropagation();
    e.preventDefault();
    const replicates = parseFloat(e.target.value);
    if(replicates < 0 || isNaN(replicates)) return;
    
    //Update the unknowns properties
    unknown.sdspageValues.replicates = replicates;
    unknown.sdspageValues.replicateVol = unknown.sdspageValues.volPerWell*replicates;
    unknown.sdspageValues.replicateProteinVol = unknown.sdspageValues.proteinVolPerWell*replicates;
    unknown.sdspageValues.replicateLaemmliVol = unknown.sdspageValues.laemmliVolPerWell*replicates;
    unknown.sdspageValues.replicateBufferVol = unknown.sdspageValues.bufferVolPerWell*replicates;

    //Update the UI
    document.getElementById(`Replicates-${unknown.name}`).textContent = replicates.toString();
    document.getElementById(`Vol[${vol}]-${unknown.name}`).textContent = unknown.sdspageValues.replicateVol.toFixed(2);
    document.getElementById(`Protein Vol[${vol}]-${unknown.name}`).textContent = unknown.sdspageValues.replicateProteinVol.toFixed(2);
    document.getElementById(`4X Laemmli Vol[${vol}]-${unknown.name}`).textContent = unknown.sdspageValues.replicateLaemmliVol.toFixed(2);
    document.getElementById(`H2O Vol[${vol}]-${unknown.name}`).textContent = unknown.sdspageValues.replicateBufferVol.toFixed(2);
    
}

/**
 * @param {number[][]} xyValues
 * @returns {RegressionObject}
 */
function getLinearRegression(xyValues){
    const {m,b} = ss.linearRegression(xyValues);
    const eq = x => m*x+b;
    const invEq = y => (y-b)/m;
    const rSquared = ss.rSquared(xyValues, eq);
    return {
        parameters:new Map([["m", m], ["b", b]]),
        eq,
        invEq,
        rSquared,
    }
}

/**
 * @param {number[][]} xyValues
 * @returns {RegressionObject}
 */
function getLogRegression(xyValues){
    const logXYValues = xyValues.filter(xy => xy[0] !== 0).map(xy => [Math.log10(xy[0]), xy[1]]);
    const {m,b} = ss.linearRegression(logXYValues);
    const eq = x => m*Math.log10(x)+b;
    const invEq = y => 10**((y-b)/m);
    const rSquared = ss.rSquared(xyValues.filter(xy => xy[0] !== 0), eq);
    return {
        parameters:new Map([["m", m], ["b", b]]),
        eq,
        invEq,
        rSquared,
    }
}

/**
 * @param {number[][]} xyValues
 * @returns {RegressionObject}
 */
function get4ParameterHillRegression(xyValues){
    //Pass in the inital guesses for the paratemers of best fit as follows, a,b,c,d
    //a is minimum response at x = 0
    //b is the hill slope of the curve at c
    //c is the point of inflection, EC50/IC50
    //d is the max response at x = infinite
    function model(x,p){
        return x.map(function(x_i){return p[3]+((p[0]-p[3])/(1+((x_i/p[2])**p[1])))})
    }
    const ys = xyValues.map(xyValue => xyValue[1]);
    const xs = xyValues.map(xyValue => xyValue[0]); 
    const params = [ss.min(xs), 0, ss.mean(xs), ss.max(ys)]
    const bestParams = fminsearch(model, params, xs, ys);
    const [A,B,C,D] = bestParams;
    return {
        parameters:new Map([["A",A], ["B", B], ["C", C], ["D", D]]),
        rSquared:NaN,
        eq: x=> D + ((A-D)/(1+((x/C)**B))),
        invEq: y => C*((((A-D)/(y-D))-1)**(1/B)),
    }
}

function fminsearch(fun,Parm0,x,y,Opt){
    //Github source: https://github.com/jonasalmeida/fminsearch/blob/gh-pages/fminsearch.js
    // fun = function(x,Parm)
	// example
	//
	// x = [32,37,42,47,52,57,62,67,72,77,82,87,92];y=[749,1525,1947,2201,2380,2537,2671,2758,2803,2943,3007,2979,2992]
	// fun = function(x,P){return x.map(function(xi){return (P[0]+1/(1/(P[1]*(xi-P[2]))+1/P[3]))})}
	// Parms=jmat.fminsearch(fun,[100,30,10,5000],x,y)
	//
	// Another test:
	// x=[32,37,42,47,52,57,62,67,72,77,82,87,92];y=[0,34,59,77,99,114,121,133,146,159,165,173,170];
	//
	// Opt is an object will all other parameters, from the objective function (cost function), to the 
	// number of iterations, initial step vector and the display switch, for example
	// Parms=fminsearch(fun,[100,30,10,5000],x,y,{maxIter:10000,display:false})
	
	if(!Opt){Opt={}};
	if(!Opt.maxIter){Opt.maxIter=1000};
	if(!Opt.step){// initial step is 1/100 of initial value (remember not to use zero in Parm0)
		Opt.step=Parm0.map(function(p){return p/100});
		Opt.step=Opt.step.map(function(si){if(si==0){return 1}else{ return si}}); // convert null steps into 1's
	};
	if(typeof(Opt.display)=='undefined'){Opt.display=true};
	if(!Opt.objFun){Opt.objFun=function(y,yp){return y.map(function(yi,i){return Math.pow((yi-yp[i]),2)}).reduce(function(a,b){return a+b})}} //SSD
	
	var cloneVector=function(V){return V.map(function(v){return v})};
	var ya,y0,yb,fP0,fP1;
	var P0=cloneVector(Parm0),P1=cloneVector(Parm0);
	var n = P0.length;
	var step=Opt.step;
	var funParm=function(P){return Opt.objFun(y,fun(x,P))}//function (of Parameters) to minimize
	// silly multi-univariate screening
	for(var i=0;i<Opt.maxIter;i++){
		for(var j=0;j<n;j++){ // take a step for each parameter
			P1=cloneVector(P0);
			P1[j]+=step[j];
			if(funParm(P1)<funParm(P0)){ // if parm value going in the righ direction
				step[j]=1.2*step[j]; // then go a little faster
				P0=cloneVector(P1);
			}
			else{
				step[j]=-(0.5*step[j]); // otherwiese reverse and go slower
			}	
		}
		if(Opt.display){if(i>(Opt.maxIter-10)){console.log(i+1,funParm(P0),P0)}}
	}
	if (!!document.getElementById('plot')){ // if there is then use it
		fminsearch.plot(x,y,fun(x,P0),P0);
	}
	return P0
};


main()