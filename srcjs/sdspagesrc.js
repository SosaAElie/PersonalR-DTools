const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const xlsx = require("xlsx");

//Global variable to store the reference to the created chart & chart image for excel
let CHART = null;
let CHARTIMAGE = null;
let BARCHART = null;

/**
 * @typedef {Object} Sample
 * @property {string} name - The name of the sample
 * @property {string} type - The type of the sample i.e standard, sample, control, etc.
 * @property {number[]} ys - The OD(s)
 * @property {number} x - The concentration
 * @property {RegressionAnalysis} regressionAnalysis - 
 * @property {number} interpolatedX - The interpolated concentration
 * @property {number} actualX - The interpolated concentration times the dilution factor
 * @property {number} convertedX - The converted concentration of the actual or interpolated x to the desired units
 * @property {number} dilutionFactor - The dilution factor of the sample
 * @property {string} units - The units of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string} convertedUnits - The units to convert to of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string[]} wellPositions - The wells the sample was loaded in i.e A1, B1, C1, etc.
 * @property {number[]} wellNumbers - The well numbers the sample was loaded in i.e 1 2,3,4, etc.
 * @property {number} averageY - The average of y if sample was loaded in replicates 
 * @property {number|string} stdev - The standard deviation of y if sample was loaded in replicates 
 * @property {number|string} totalGelProtein - The total protein to load into the protein gel
 * @property {number|string} totalVolume - The total desired volume to load into the protein gel
 * @property {number|string} stockProteinVol - The total stock protein volume required
 * @property {number|string} laemmliVol - The volume of 4x laemmli required
 * @property {number|string} bufferVol - The volume of buffer required to reach total volume
 * @property {Function} getData - returns a list of important data for the same that can be used to display in a table
 * @property {Function} getGelData - returns a list containing the sample name, converted concentration to display in the gel loading table
 * @property {Function} getExcelData - returns a list of data to write to excel
 * 
*/

/**
 * @typedef {Object} RegressionAnalysis
 * @property {string} regressionType - The name of the regression model used, eg. linear, log, 4PL
 * @property {number} interpolatedX - The interpolated concentration obtained from the regression model
 * @property {number} actualX - The interpolated concentration times the dilution factor
 * @property {number} convertedX - The actual concentration converted to the desired units
 * @property {number|string} stockProteinVol - The total stock protein volume required
 */

/**
 * @typedef {Object} LightweightSample
 * @property {string} wellPosition - The well position the sample was loaded in
 * @property {number} wellNumber - The well number the same was loaded in
 * @property {string} name - The name of the sample
 * @property {string} type - The type of the sample
 */

/**
 * @typedef {Object} RegressionObject
 * @property {Map<string,number>} parameters - The parameters of the regression model, for linear and log its m and b, for 4PL its a,d,c,b
 * @property {number} rSquared - The coerrelation coefficient, the closer to 1 the better the model
 * @property {CallableFunction} eq - The regression model equation, takes in x, returns y
 * @property {CallableFunction} invEq - The inverse regression model equation, takes in y returns x
 */

/**
 * @typedef {Object} ParsedData
 * @property {Sample[]} samples
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
 * @property {CallableFunction} appendCol
 * @property {CallableFunction} appendRow
 * @property {CallableFunction} at
 * @property {CallableFunction} combine
 * @property {CallableFunction} appendAt
 */


function main(){
    document.getElementById("process-button").addEventListener("click", handleClick);
    document.getElementById("dilution-factor").addEventListener("input", handleNumericalInput);
    document.getElementById("units-conversion").addEventListener("input", handleConversionInput);
    document.getElementById("total-volume").addEventListener("input", handleNumericalInput);
    document.getElementById("total-protein").addEventListener("input", handleNumericalInput);
    document.getElementById("rawdata-input").addEventListener("input", updateLabel);
    document.getElementById("template-input").addEventListener("input", updateLabel);

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
    if(CHART === null) return;
    if(e.target.checked){
        CHART.data.datasets.filter(dataset => dataset.label === "Unknowns")[0].data = CHART.data.storage.filteredUnknowns;
    }
    else{
        CHART.data.datasets.filter(dataset => dataset.label === "Unknowns")[0].data = CHART.data.storage.allUnknowns;
    }
    CHART.update();
}


/**
 * @param {InputEvent} e
*/
function handleXScale(e){
    if(CHART){
        CHART.options.scales.x.type = e.target.value;
        CHART.update();
    }
}
/**
 * @param {InputEvent} e
*/
function handleNumericalInput(e){
    if(parseInt(e.target.value) < 1){
        this.setCustomValidity("The Value Has To Be Greater Than or Equal to 1");
        this.reportValidity();
        document.getElementById("process-button").removeEventListener("click", handleClick);
    }
    else{        
        this.setCustomValidity("");
        document.getElementById("process-button").addEventListener("click", handleClick);
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
        document.getElementById("process-button").removeEventListener("click", handleClick);
        this.setCustomValidity("Enter the units in the correct format, i.e. mass/volume");
        this.reportValidity();
    }
    else{
        this.setCustomValidity("");
        const [mass, volume] = unit.split("/");
        if(masses.indexOf(mass) < 0){
            document.getElementById("process-button").removeEventListener("click", handleClick);
            this.setCustomValidity("Not a Supported Unit of Mass, i.e. g, mg, ug, ng, fg");
            this.reportValidity();
        }
        else if(volumes.indexOf(volume) < 0){
            document.getElementById("process-button").removeEventListener("click", handleClick);
            this.setCustomValidity("Not a Supported Unit of Volume, i.e. L, mL, uL, nL, fL");
            this.reportValidity();            
        }
        else{
            document.getElementById("process-button").addEventListener("click", handleClick);
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
    const rawdata = await parseDelimitedFile(rawdataFile);
    const rawTemplate = await parseDelimitedFile(templateFile);
    const samples = new Map();
    const lightSamples = [];
    //Grabs only the raw data assuming the data is in a 96-well plate layout
    const data = rawdata.slice(3,11).map(row => row.slice(2, 14));

    //Use the filenames' stem
    const filename = rawdataFile.name.split(".")[0];
    const templateFilename = templateFile.name.split(".")[0];

    //Grabs the names in the 96-well template
    const template = rawTemplate.slice(2,10).map(row=>row.slice(1));

    //Function definition for a property of the Sample object
    /**
     * @returns {string[]|number[]|boolean[]}
     */
    function getData(){
        return [this.name, this.type, this.averageY, this.stdev, this.interpolatedX, this.actualX, this.convertedX];
    }

    /**
     * @returns {string[]|number[]|boolean[]}
     */
    function getExcelData(){
        return this.type === "sample"?[
            this.name, this.type, this.ys, `${this.averageY.toFixed(2)}(${typeof this.stdev === "string"?this.stdev:this.stdev.toFixed(2)})`, 
            this.interpolatedX.toFixed(2), this.actualX.toFixed(2), this.convertedX.toFixed(2), this.totalGelProtein, this.totalVolume, 
            this.stockProteinVol.toFixed(2), this.laemmliVol.toFixed(2), this.bufferVol.toFixed(2)
        ]:[
            this.name, this.type, this.ys, `${this.averageY.toFixed(2)}(${typeof this.stdev === "string"?this.stdev:this.stdev.toFixed(2)})`, 
            this.interpolatedX.toFixed(2), this.actualX.toFixed(2), this.convertedX.toFixed(2), this.totalGelProtein, this.totalVolume, 
            "", "", ""
        ];
    }

    /**
     * @returns {string[]}
     */
    function getGelData(){
        return [this.name, this.convertedX.toFixed(2)];
    }

    //Iterate through each inner array and create a sample, only adding the sample to the sample list if it doesn't exist already
    const rows = data.length;
    const columns = data[0].length;
    let wellNumber = 1;
    for(let i = 0; i < rows; i++){
        const columnLetter = String.fromCharCode("A".charCodeAt(0) + i);
        for(let j = 0; j < columns; j++){
            const wellPosition = columnLetter + (j+1).toString();
            const parsedSample = parseSampleName(template[i][j]);
            const y = Number(data[i][j]);            
            const name = parsedSample.get("name");
            const type = parsedSample.get("type");

            //Create a light sample object for each item in the template
            lightSamples.push({name, wellNumber, wellPosition, type});

            //Skip over the samples labeled as none
            if(name.toLowerCase() === "none") continue;

            if(samples.has(name)){
                const sample = samples.get(name);
                sample.ys.push(y);
                sample.wellPositions.push(wellPosition);
                sample.wellNumbers.push(wellNumber);
            }
            else{
                if(parsedSample.has("units")){
                    const units = parsedSample.get("units");
                    const x = parsedSample.get("x");
                    samples.set(name, {name, type, units, wellPositions:[wellPosition], wellNumbers:[wellNumber], x, ys:[y], getData, getExcelData, getGelData});
                }
                else{
                    samples.set(name, {name, type, wellPositions:[wellPosition],wellNumbers:[wellNumber], ys:[y], getData, getExcelData, getGelData});
                }
            }
        }
    }
    //Iterate through the samples after they have all been mapped and add the averageY property
    samples.forEach((v, k, m) => v.averageY = ss.average(v.ys));
    samples.forEach((v, k, m)=> v.stdev = v.ys.length > 1?ss.standardDeviation(v.ys):"N/A")

    //Provide the filename so that it can be used to create the results xlsx file

    return {samples,filename, templateFilename, rawdata, template, rawTemplate, lightweightSamples: lightSamples};
}

/**
 * @param {string} sampleName
 * @returns {Map<string,string|number>}
 */
function parseSampleName(sampleName){
    const parsed = new Map();
    let [type,name] = sampleName.split("-");
    type = type.toLowerCase();
    switch (type){
        case "standard":
            const units = name.slice(-5);
            const x = parseFloat(name.slice(0,-5));
            parsed.set("units", units);
            parsed.set("x", x);
            break;
    }

    parsed.set("type", type);
    if(name === undefined) name = type;
    parsed.set("name", name);
    return parsed;
}

/**
 * @param {Event} e
 * @returns {null}
 */
function handleClick(e){
    const excelDownloadButton = document.getElementById("download-button");
    const rawdataFile = document.getElementById("rawdata-input").files.length >= 0?document.getElementById("rawdata-input").files[0]:null;
    const templateFile = document.getElementById("template-input").files.length >= 0?document.getElementById("template-input").files[0]:null;
    const chartCanvas = document.getElementById("regression-chart");
    const tableContainer = document.getElementById("table-container");
    const dilutionFactor = parseInt(document.getElementById("dilution-factor").value);
    const targetUnits = document.getElementById("units-conversion").value;
    const diagramContainer = document.getElementById("template-diagram");
    const gelTableContainer = document.getElementById("gel-table-container");
    const totalProtein = parseInt(document.getElementById("total-protein").value);
    const totalVolume = parseInt(document.getElementById("total-volume").value);
    const subtractBlank = document.getElementById("subtract-blank").checked;
    const proteinBarChart = document.getElementById("protein-bar-chart");
    
    
    
    //If there is no template or raw data file selected return null
    if(!rawdataFile || !templateFile) return null;
    
    //Delete current chart & table & download anchor
    if(CHART !== null){
        CHART.destroy();
        BARCHART.destroy();
        CHARTIMAGE = null;
        deleteTable(tableContainer, "results-table");
        deleteTable(gelTableContainer, "protein-loading-table");
        excelDownloadButton.replaceWith(excelDownloadButton.cloneNode(true));
        diagramContainer.innerHTML = "";
    } 
    
    merge(rawdataFile, templateFile)
    .then(parsedData =>{
        const excelDownloadButton = document.getElementById("download-button");
        const samples = Array.from(parsedData.samples.values());
        const standards = samples.filter(sample => sample.type === "standard");
        const unknowns = samples.filter(sample => sample.type === "sample");
        
        if(subtractBlank){
            const blank = ss.min(standards.map(standard => standard.averageY));
            samples.forEach(sample=> sample.averageY-=blank)
        }
        const xAndYStandards = standards.map(standard => [standard.x, standard.averageY]);
        let regressionObject;

        //Create a 96 well diagram of the template
        diagram96Well(parsedData.lightweightSamples, diagramContainer, parsedData.templateFilename);
        
        //Get user inputs for x-scale type and regression type
        const xScale = getSelectedRadioButton(document.getElementById("x-scale"));
        const regressionType = getSelectedRadioButton(document.getElementById("regression-inputs"));
        //Obtain the parameters of best fit using selected regression type
        if(regressionType === "log") regressionObject = getLogRegression(xAndYStandards);
        else if(regressionType === "linear") regressionObject = getLinearRegression(xAndYStandards);
        else regressionObject = get4ParameterHillRegression(xAndYStandards);
        const {parameters, rSquared, eq, invEq} = regressionObject;

        //Sort standards & unknowns according to their y values
        standards.sort((first, second)=>second.averageY-first.averageY);
        unknowns.sort((first, second)=>first.averageY-second.averageY);
        const units = standards[0].units;
        
        //Interpolate the concentration of all the samples using the regression model generated
        for(let sample of samples){
            sample.interpolatedX = invEq(sample.averageY);
            sample.dilutionFactor = dilutionFactor;
            sample.actualX = sample.interpolatedX*dilutionFactor;
            sample.units = units;
            sample.convertedUnits = targetUnits;
            sample.convertedX = convertConcentration(sample.actualX, units, targetUnits);
        };
        
        
        //Create chart & table
        const chartOptionsAndData = createChartOptionsAndData(unknowns, standards, rSquared, xScale, units, parsedData.filename, eq, regressionType);
        CHART = new chartjs.Chart(chartCanvas,chartOptionsAndData);
        createTable(unknowns,standards,tableContainer, units, targetUnits, dilutionFactor);
        
        //Create Gel Loading table
        createProteinGelLoadingTable(unknowns, gelTableContainer,totalProtein, totalVolume);
        excelDownloadButton.addEventListener("click", (e)=>handleExcelDownload(e,parsedData, standards, unknowns, dilutionFactor, units, targetUnits, subtractBlank, parameters, rSquared));

        //Create Protein Bar Chart
        BARCHART = new chartjs.Chart(proteinBarChart, createBarChartOptionsAndData(unknowns));

    })
}
/**
 * @param {Event} e
 * @param {ParsedData} parsedData
 * @param {Sample[]} standards
 * @param {Sample[]} unknowns
 * @param {number} dilutionFactor
 * @param {string} units
 * @param {string} targetUnits
 * @param {boolean} subtractBlank
 * @param {Map<string, number>} parameters
 * @param {number} rSquared
 */
function handleExcelDownload(e, parsedData, standards, unknowns, dilutionFactor, units, targetUnits, subtractBlank, parameters, rSquared){
    //Create pseudoExcels in memory in order to write to excel and create downloadable link
    const psuedoExcel = createPsuedoExcel(null, null, parsedData.rawdata);
    psuedoExcel.combine(createPsuedoExcel(null, null, parsedData.template), 3, 2, false);
    const startingCol = psuedoExcel.columns;
    psuedoExcel.appendAt(0, psuedoExcel.columns, true, ["Name", "Type", "Individual Values", subtractBlank?"Average(Stdev) Blank Subtracted":"Average(Stdev)", `Interpolated Concentration [${units}]`, `${dilutionFactor}X Concentration [${units}]`, `${dilutionFactor}X Concentration [${targetUnits}]`, "Protein [ug]", "Desired Vol [uL]", "Stock Protein [uL]", "4X Laemmli [uL]", "Buffer [uL]"]);
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
    // appendWorksheet(wkbk, null, null, CHARTIMAGE);

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
 * @returns {string}
 */
function getSelectedRadioButton(container, valueOnly = true){
    const radioDivs = Array.from(container.querySelectorAll(".radio"));
    const selected = [];
    for(let radioDiv of radioDivs){
        selected.push(...Array.from(radioDiv.children).filter(element=>element.tagName === "INPUT" && element.checked === true))
    }
    return valueOnly?selected[0].defaultValue:selected[0];
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
 * @param {Sample[]} unknowns - A list of sample objects to display in the table
 * @param {Sample[]} standards - A list of sample objects to display in the table
 * @param {string} units - The units of the samples
 * @param {string} convertedUnits - The converted units of the samples
 * @param {string} dilutionFactor - The dilution factor of the samples
 * @param {Element} container - The element to append the table element to as a child
 * @returns {null}
 */
function createTable(unknowns, standards, container, units, convertedUnits, dilutionFactor){
    //Create table element
    const table = document.createElement("table");
    table.id = "results-table";

    //Create table title
    const title = document.createElement("caption");
    title.textContent = "Interpolation Results";
    table.appendChild(title);

    //Create column headers
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = ["Name", "Sample Type", "Average","StDev", `Interpolated Concentration [${units}]`, `${dilutionFactor}X Concentration [${units}]`, `${dilutionFactor}X Concentration [${convertedUnits}]`];
    for(let header of headers){
        const row = document.createElement("th");
        row.textContent = header;
        headerRow.appendChild(row);
    }

    //Create table body
    const body = document.createElement("tbody");
    headerContainer.appendChild(headerRow);

    //Determine the lowest & highest standard in order to change the text to red if the sample is outside the standard curve 
    const standardYs = standards.map(standard => standard.averageY);
    const lowest = ss.min(standardYs)
    const highest = ss.max(standardYs)
    
    for(let standard of standards){        
        const row = document.createElement("tr");
        for (let data of standard.getData()){
            const td = document.createElement("td");
            if(typeof data === "number")data = data.toFixed(2);
            td.textContent = data;
            row.appendChild(td);
        }
        body.appendChild(row);
    };

    for(let unknown of unknowns){       
        const row = document.createElement("tr");
        
        //If unknown y value is outside the standard curve change text to red
        if(unknown.averageY <= lowest || unknown.averageY >= highest) row.className = "outsideUnknown";

        for (let data of unknown.getData()){
            const td = document.createElement("td");
            if(typeof data === "number") data = data.toFixed(2);
            td.textContent = data;
            row.appendChild(td);
        }
        body.appendChild(row);
    }
    table.appendChild(headerContainer);
    table.appendChild(body);
    container.appendChild(table);
}

/**
 * @param {File} file
 * @returns {Promise<string[][]>}
 */
function parseDelimitedFile(file){
    return new Promise((resolve, reject)=>{
        papa.parse(file, {complete:(results, file)=>{
            resolve(results.data)
        }})
    })
};

/**
 * @param {Sample[]} unknowns
 * @param {Sample[]} standards
 * @param {number} rSquared
 * @param {string} xScale
 * @param {string} units
 * @param {string} title
 * @param {CallableFunction} eq
 * @param {string} regressionType
 * @returns {chartjs.ChartConfiguration}
 */
function createChartOptionsAndData(unknowns, standards, rSquared, xScale, units, title, eq, regressionType){
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

    //Return the chart options object
    return {
        type:"scatter",
        data:{
            storage:{
                allUnknowns: unknowns.map(sample => {return {x:sample.interpolatedX, y:sample.averageY}}),
                filteredUnknowns: unknowns.map(sample => {return sample.averageY <= maxY && sample.averageY >= minY ? {x:sample.interpolatedX, y:sample.averageY}:{x:null, y:null}}),
            },
            datasets:[  

                {
                    label:"Standards",
                    data:standards.map(standard => {return {x:standard.x, y:standard.averageY}}),
                    pointBackgroundColor:"#D6EFD8",
                    pointBorderColor:"black"
                },
                {
                    label:"Unknowns",
                    data: unknowns.map(sample => {return {x:sample.interpolatedX, y:sample.averageY}}),
                    pointBorderColor:"black"
                },
                {
                    label:`Regression Model: R-Squared: ${rSquared.toFixed(2)}`,
                    data: regressionType === "4pl"?mockData:standards.map(standard => {return {x:standard.interpolatedX, y:standard.averageY}}),
                    showLine:true,
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
                        text:`Protein [${units}]`,
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
                        text:"Absorbance or Luminescence",
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
                }
                
            },
            animation:{
                onComplete:(e)=> CHARTIMAGE = CHART.toBase64Image(),
            }
        }
    }
}
/**
 * @param {Sample[]} unknowns
 * @returns {chartjs.ChartConfiguration}
 */
function createBarChartOptionsAndData(unknowns){
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
                    label:`Protein Concentration [${unknowns[0].convertedUnits}]`,
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
                        text:`Protein Concentration [${unknowns[0].convertedUnits}]`,
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
                    text: "Back Calculated Protein Concentration",
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
 * @param {number} conc
 * @param {string} startingUnits
 * @param {string} targetUnits
 * @returns {number}
 */
function convertConcentration(conc, startingUnits, targetUnits){
    const masses = ["g", "mg", "ug", "ng", "fg"];
    const volumes = ["L", "mL", "uL", "nL", "fL"];
    const thousands = 3;
    const [currMass, currVol] = startingUnits.split("/");
    const [targetMass, targetVol] = targetUnits.split("/");

    return conc * (10**(thousands*(masses.indexOf(targetMass)-masses.indexOf(currMass))))* (10**(thousands*(volumes.indexOf(currVol)-volumes.indexOf(targetVol))));
}

/** 
 * @param {LightweightSample[]} lightSamples
 * @param {Element} parent
 * @param {string} diagramTitle
 * @returns {void}
**/
function diagram96Well(lightSamples, parent, diagramTitle){
    const title = document.createElement("h3");
    title.id = "diagram-title";
    title.textContent = diagramTitle;
    parent.appendChild(title);
    for(let sample of lightSamples){
        const circularDiv = document.createElement("div");
        const wellPosition = document.createElement("p");
        wellPosition.textContent = sample.wellPosition;
        const hoverText = document.createElement("span");
        hoverText.textContent = sample.name;
        hoverText.className = "hovertext"
        circularDiv.className = "well";
        circularDiv.appendChild(hoverText);
        circularDiv.appendChild(wellPosition)
        if(sample.name.toUpperCase()==="NONE"){
            circularDiv.style.backgroundColor = "white";
        }
        else if(sample.type.toUpperCase()==="STANDARD"){
            circularDiv.style.backgroundColor = "#D6EFD8";
        }
        parent.appendChild(circularDiv);
    }
}

/** 
 * @param {Sample[]} unknowns
 * @param {Element} parent
 * @param {number} totalProtein
 * @param {number} totalVolume
 * @returns {void}
**/
function createProteinGelLoadingTable(unknowns, parent, totalProtein, totalVolume){
    const units = unknowns[0].convertedUnits;
    const [mass, vol] = units.split("/")
    const dilutionFactor = unknowns[0].dilutionFactor;
    const desiredVolEles = [];
    const targetProteinEles = [];

    //Create table element to hold subsequent elements
    const table = document.createElement("table");
    table.id = "protein-loading-table";

    //Create table title
    const title = document.createElement("caption");
    title.textContent = "Protein SDS Gel Electrophoresis Loading Table"
    table.appendChild(title);

    //Create table header row
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = ["Name", `${dilutionFactor}X Concentration [${units}]`, `Protein [${mass}]`, `Desired Vol [${vol}]`, `Stock Protein [${vol}]`, `4X Laemmli [${vol}]`, `Buffer [${vol}]`];
    for(let header of headers){
        const row = document.createElement("th");
        row.textContent = header;
        headerRow.appendChild(row);
    }
    
    headerContainer.appendChild(headerRow);
    
    //Create table body and rows
    const body = document.createElement("tbody");
    for(let unknown of unknowns){        
        const row = document.createElement("tr");
        const unknownsGelData = unknown.getGelData();
        for(let i = 0; i < headers.length; i++){
            const td = document.createElement("td");
            let data = unknownsGelData[i];
            if(i < unknownsGelData.length) td.textContent = data;
            else{
                const inputEle = document.createElement("input");
                inputEle.type = "number";

                if(headers[i] === `Protein [${mass}]`){
                    targetProteinEles.push(inputEle);
                    inputEle.id = `Protein [${mass}]-${unknown.name}`;
                    inputEle.value = totalProtein;
                    inputEle.addEventListener("input", e=>{
                        const targetProtein = parseFloat(e.target.value);
                        if(targetProtein < 0 || targetProtein === undefined) return;
                        const proteinVol = targetProtein/unknown.convertedX;
                        document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent = proteinVol.toFixed(2);
                        const laemmliEle = document.getElementById(`4X Laemmli [${vol}]-${unknown.name}`);
                        const desiredVolEle = document.getElementById(`Desired Vol [${vol}]-${unknown.name}`);
                        const bufferEle = document.getElementById(`Buffer [${vol}]-${unknown.name}`);
                        if(laemmliEle.textContent !== ""){
                            const desiredVol = parseFloat(desiredVolEle.value);
                            const laemmliVol = desiredVol/4;
                            const bufferVol = desiredVol - laemmliVol - parseFloat(document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent);
                            
                            laemmliEle.textContent = laemmliVol.toFixed(2);
                            bufferEle.textContent = bufferVol.toFixed(2);
                            
                            unknown.laemmliVol = laemmliVol;
                            unknown.bufferVol = bufferVol;
                            unknown.totalGelProtein = targetProtein;
                            unknown.stockProteinVol = proteinVol;
                        }
                    })
                    td.appendChild(inputEle);
                }
                else if(headers[i] === `Desired Vol [${vol}]`){
                    desiredVolEles.push(inputEle);
                    inputEle.id = `Desired Vol [${vol}]-${unknown.name}`;
                    inputEle.value = totalVolume;
                    inputEle.addEventListener("input", e=>{
                        const desiredVol = parseFloat(e.target.value);
                        if(desiredVol < 0 || desiredVol === undefined) return;
                        const laemmliVol = desiredVol/4;
                        const bufferVol = desiredVol - laemmliVol - parseFloat(document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent);
                        
                        document.getElementById(`4X Laemmli [${vol}]-${unknown.name}`).textContent = laemmliVol.toFixed(2);
                        document.getElementById(`Buffer [${vol}]-${unknown.name}`).textContent = bufferVol.toFixed(2);
                        
                        unknown.laemmliVol = laemmliVol;
                        unknown.bufferVol = bufferVol;
                        unknown.totalVolume = desiredVol;
                    })
                    td.appendChild(inputEle);
                }
                else{
                    td.textContent = "";
                    td.id = `${headers[i]}-${unknown.name}`;
                }
            }
            row.appendChild(td);
        }
        body.appendChild(row);
    }

    //Add elements to table
    table.appendChild(headerContainer);
    table.appendChild(body);
    
    //Add table to the parent container
    parent.appendChild(table);

    //Autofill the rest of the elements with the deault values of the input elements
    for(let i = 0; i < targetProteinEles.length; i++){
        const targetProtein = parseFloat(targetProteinEles[i].value);
        const desiredVol = parseFloat(desiredVolEles[i].value);
        const unknown = unknowns[i];
        const proteinVol = (targetProtein/unknown.convertedX);
        const laemmliVol = (desiredVol/4);
        const bufferVol = (desiredVol - proteinVol - laemmliVol);

        unknown.totalGelProtein = targetProtein;
        unknown.totalVolume = desiredVol;
        unknown.stockProteinVol = proteinVol;
        unknown.laemmliVol = laemmliVol;
        unknown.bufferVol = bufferVol;

        document.getElementById(`4X Laemmli [${vol}]-${unknown.name}`).textContent = laemmliVol.toFixed(2);
        document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent = proteinVol.toFixed(2);
        document.getElementById(`Buffer [${vol}]-${unknown.name}`).textContent = bufferVol.toFixed(2);
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