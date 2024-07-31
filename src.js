const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const xlsx = require("xlsx");

//Global variable to store the reference to the created chart
let CHART = null;

/**
 * @typedef {Object} Sample
 * @property {string} name - The name of the sample
 * @property {string} type - The type of the sample i.e standard, unknown, control, etc.
 * @property {number[]} ys - The OD(s)
 * @property {number} x - The concentration
 * @property {number} interpolatedX - The interpolated concentration
 * @property {number} actualX - The interpolated concentration times the dilution factor
 * @property {number} convertedX - The converted concentration of the actual x to the desired units
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
 * @property {Function} getData - Function that returns a list of important data for the same that can be used to display in a table
 * @property {Function} getGelData - Function that returns a list of important data for the same that can be used to display in a gel loading table
 * @property {Function} getExcelData - Function that returns a list of data to write to excel
 * 
*/

/**
 * @typedef {Object} LightSample
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
 * @property {string[][]} rawdata
 * @property {string[][]} template
 * @property {LightSample[]} lightSamples
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
    const rawdata = await parseRawDataFile(rawdataFile);
    const rawTemplate = await parseTemplateFile(templateFile);
    const samples = new Map();
    const lightSamples = [];
    
    //Grabs only the raw data assuming the data is in a 96-well plate layout
    const data = rawdata.slice(3,11).map(row => row.slice(2, -1));

    //Use the raw data filename stem
    const filename = rawdataFile.name.split(".")[0];

    //Grabs the names in the 96-well template
    const template = rawTemplate.slice(2,10).map(row=>row.slice(1));

    //Function definition for a property of the Sample object
    /**
     * @returns {string[]|number[]|boolean[]}
     */
    function getData(){
        return [this.name, this.type, this.averageY, this.interpolatedX, this.actualX, this.convertedX];
    }

    /**
     * @returns {string[]|number[]|boolean[]}
     */
    function getExcelData(){
        return [this.name, this.type, this.ys, `${this.averageY}(${this.stdev})`, this.interpolatedX.toFixed(3), this.actualX.toFixed(3), this.convertedX.toFixed(3), this.totalGelProtein, this.totalVolume, this.stockProteinVol, this.laemmliVol, this.bufferVol];
    }

    /**
     * @returns {string[]|number[]|boolean[]}
     */
    function getGelData(){
        return [this.name, this.convertedX];
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

    return {samples,filename,rawdata, template, lightSamples};
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
    const rawdataFile = document.getElementById("rawdata-input").files.length >= 0?document.getElementById("rawdata-input").files[0]:null;
    const templateFile = document.getElementById("template-input").files.length >= 0?document.getElementById("template-input").files[0]:null;
    const chartCanvas = document.getElementById("regression-chart");
    const tableContainer = document.getElementById("table-container");
    const fileContainer = document.getElementById("file-container");
    const dilutionFactor = parseInt(document.getElementById("dilution-factor").value);
    const targetUnits = document.getElementById("units-conversion").value;
    const diagramContainer = document.getElementById("template-diagram");
    const gelTableContainer = document.getElementById("gel-table-container");
    const totalProtein = parseInt(document.getElementById("total-protein").value);
    const totalVolume = parseInt(document.getElementById("total-volume").value);


    //If there is no template or raw data file selected return null
    if(!rawdataFile || !templateFile) return null;

    //Delete current chart & table & download anchor
    if(CHART !== null){
        CHART.destroy();
        deleteTable(tableContainer, "results-table");
        deleteTable(gelTableContainer, "protein-loading-table");
        window.URL.revokeObjectURL(fileContainer.lastChild.href);
        fileContainer.removeChild(fileContainer.lastChild);
        diagramContainer.innerHTML = "";
    } 
        
    merge(rawdataFile, templateFile)
    .then(parsedData =>{
        const samples = Array.from(parsedData.samples.values());
        const standards = samples.filter(sample => sample.type === "standard");
        const unknowns = samples.filter(sample => sample.type === "sample");
        const xAndYStandards = standards.map(standard => [standard.x, standard.averageY]);
        let regressionObject;

        //Create a 96 well diagram of the template
        diagram96Well(parsedData.lightSamples, diagramContainer);
        
        //Get user inputs for x-scale type and regression type
        const xScale = getSelectedRadioButton(document.getElementById("x-scale"));
        const regressionType = getSelectedRadioButton(document.getElementById("regression-inputs"));
        
        //Obtain the parameters of best fit using selected regression type
        if(regressionType === "log") regressionObject = getLogRegression(xAndYStandards);
        else if(regressionType === "linear") regressionObject = getLinearRegression(xAndYStandards);
        else regressionObject = get4ParameterHillRegression(xAndYStandards);
        const {parameters, rSquared, eq, invEq} = regressionObject;

        //Sort samples according to their y values
        standards.sort((first, second)=>second.averageY-first.averageY);
        // unknowns.sort((first,second)=>ss.sum(second.wellNumbers)-ss.sum(first.wellNumbers));
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

        //Create pseudoExcels in memory in order to write to excel and create downloadable link
        const psuedoExcel = createPsuedoExcel(null, null, parsedData.rawdata);
        psuedoExcel.combine(createPsuedoExcel(null, null, parsedData.template), 3, 2, false);
        const startingCol = psuedoExcel.columns;
        psuedoExcel.appendAt(0, psuedoExcel.columns, true, ["Name", "Type", "Individual Values", "Average(Stdev)", `Interpolated Concentration [${units}]`, `${dilutionFactor}X Concentration [${units}]`, `${dilutionFactor}X Concentration [${targetUnits}]`, "Protein [ug]", "Desired Vol [uL]", "Stock Protein [uL]", "4X Laemmli [uL]", "Buffer [uL]"]);
        standards.forEach((standard, i, arr) => psuedoExcel.appendAt(i+1, startingCol, true, standard.getExcelData()));
        unknowns.forEach((unknown, i, arr) => psuedoExcel.appendAt(standards.length+i+1, startingCol, true, unknown.getExcelData()));

        //Add regression model parameters of best fit to pseudoExcel
        psuedoExcel.appendCol(psuedoExcel.columns, [""]);
        psuedoExcel.appendCol(psuedoExcel.columns,["R-Squared", ...Array.from(parameters.keys()), "Dilution Factor"]);
        psuedoExcel.appendCol(psuedoExcel.columns,[rSquared, ...Array.from(parameters.values()), dilutionFactor]);


        //create an excel file in memory with the desired data
        const wkbk = createWkbk(psuedoExcel.data);
        const binaryData = xlsx.write(wkbk, {bookType:"xlsx", type:"buffer"});
        const blob = new Blob([binaryData], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

        //Create a download link and associated anchor element
        const link = window.URL.createObjectURL(blob);
        const anchorElem = document.createElement("a");
        anchorElem.href = link;
        anchorElem.download = parsedData.filename+".xlsx";
        anchorElem.innerText = parsedData.filename+".xlsx";
        document.getElementById("file-container").appendChild(anchorElem);  
    })
/**
 * @param {HTMLDivElement} container
 * @returns {string}
 */
function getSelectedRadioButton(container){
    const selectedRadio = Array.from(container.children).filter(element=>element.tagName === "INPUT" && element.checked === true);    
    return selectedRadio[0].defaultValue;
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
    const rSquared = ss.rSquared(logXYValues, eq);
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
    const headers = ["Name", "Sample Type", "Average Absorbance or Luminescence",`Interpolated Concentration [${units}]`, `${dilutionFactor}X Concentration [${units}]`, `${dilutionFactor}X Concentration [${convertedUnits}]`];
    for(let header of headers){
        const row = document.createElement("th");
        row.textContent = header;
        headerRow.appendChild(row);
    }

    const body = document.createElement("tbody");
    headerContainer.appendChild(headerRow);
    
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
function parseRawDataFile(file){
    return new Promise((resolve, reject)=>{
        papa.parse(file, {encoding:"utf-16", delimiter:"\t", complete:(results, file)=>{
            resolve(results.data)
        }})
    })
};

/**
 * @param {File} file
 * @returns {Promise<string[][]>}
 */
function parseTemplateFile(file){
    return new Promise((resolve, reject)=>{
        papa.parse(file, {encoding:"utf-8", delimiter:",", complete:(results, file)=>{
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
    
    //Give regression model line a smooth curve if regression type is 4PL
    if(regressionType === "4pl"){
        const standardXs = standards.map(standard => standard.x);
        const standardYs = standards.map(standard => standard.averageY);
        const minX = ss.min(standardXs);
        const minY = ss.min(standardYs);
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
                    position:"bottom",
                    title:{
                        display:true,
                        text:`Protein [${units}]`,
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "#000000",
                    },
                },
                y:{
                    position:"left",
                    title:{
                        display:true,
                        text:"Absorbance or Luminescence",
                        font:{
                            size:14,
                            weight:"bold",
                        },
                        color: "#000000", 
                    },
                               
                }
            },
            plugins:{
                title:{
                    display:true,
                    text: title,
                    font:{
                        size:16,
                    },
                    color: "#000000",
                },
            }
        }
    }
}

/**
 * @param {string[][]} data
 * @returns {xlsx.WorkBook}
 */
function createWkbk(data){
    const wkbk = xlsx.utils.book_new();
    const wkst = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wkbk, wkst);
    return wkbk;
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
        data = startingData;
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
        // for(let i = 0; i < data.length; i++){
        //     if(i >= this.rows) this.data.push(new Array(this.columns).fill(null));
        //     this.data[i].push(data[i].toString());
        // };
        // this.columns+=1;
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
 * @param {LightSample[]} lightSamples
 * @param {Element} parent
 * @returns {void}
**/
function diagram96Well(lightSamples, parent){

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
            if(i < unknownsGelData.length){
                if(typeof data === "number") data = data.toFixed(2);
                td.textContent = data;
            }
            else{
                const inputEle = document.createElement("input");
                inputEle.type = "number";
                if(headers[i] === `Protein [${mass}]`){
                    targetProteinEles.push(inputEle);
                    inputEle.id = `Protein [${mass}]-${unknown.name}`;
                    inputEle.value = totalProtein;
                    inputEle.addEventListener("input", e=>{
                        const targetProteinAmount = parseFloat(e.target.value);
                        if(targetProteinAmount < 0 || targetProteinAmount === undefined) return;
                        const reqVol = targetProteinAmount/unknown.convertedX;
                        document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent = reqVol.toFixed(2);
                        const laemmliEle = document.getElementById(`4X Laemmli [${vol}]-${unknown.name}`);
                        const desiredVolEle = document.getElementById(`Desired Vol [${vol}]-${unknown.name}`);
                        const bufferEle = document.getElementById(`Buffer [${vol}]-${unknown.name}`);
                        if(laemmliEle.textContent !== ""){
                            const desiredVol = parseFloat(desiredVolEle.value);
                            const laemmliVol = desiredVol/4;
                            const bufferVol = desiredVol - laemmliVol - parseFloat(document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent);
                            laemmliEle.textContent = laemmliVol.toFixed(2);
                            bufferEle.textContent = bufferVol.toFixed(2);
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
        const proteinVol = (targetProtein/unknown.convertedX).toFixed(2);
        const laemmliVol = (desiredVol/4).toFixed(2);
        const bufferVol = (desiredVol - proteinVol - laemmliVol).toFixed(2);

        unknown.totalGelProtein = targetProtein;
        unknown.totalVolume = desiredVol;
        unknown.stockProteinVol = proteinVol;
        unknown.laemmliVol = laemmliVol;
        unknown.bufferVol = bufferVol;

        document.getElementById(`4X Laemmli [${vol}]-${unknown.name}`).textContent = laemmliVol;
        document.getElementById(`Stock Protein [${vol}]-${unknown.name}`).textContent = proteinVol;
        document.getElementById(`Buffer [${vol}]-${unknown.name}`).textContent = bufferVol;
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