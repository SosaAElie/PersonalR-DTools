const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
require("chartjs-plugin-datalabels");
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
 * @property {string} units - The units of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string} convertedUnits - The units to convert to of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string[]} wellPositions - The wells the sample was loaded in i.e A1, B1, C1, etc.
 * @property {number[]} wellNumbers - The well numbers the sample was loaded in i.e 1 2,3,4, etc.
 * @property {number} averageY - The average of y if sample was loaded in replicates 
 * @property {number|string} stdev - The standard deviation of y if sample was loaded in replicates 
 * @property {Function} getData - Function that returns a list of important data for the same that can be used to display in a table
 * @property {Function} getExcelData - Function that returns a list of data to write to excel
 * 
*/

/**
 * @typedef {Object} LightSample
 * @property {string} wellPosition - The well position the sample was loaded in
 * @property {number} wellNumber - The well number the same was loaded in
 * @property {string} name - The name of the sample
 */

/**
 * @typedef {Object} RegressionObject
 * @property {number} b - The y-intercept
 * @property {number} m - The slope
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
    document.getElementById("dilution-factor").addEventListener("input", handleDilutionInput);
    document.getElementById("units-conversion").addEventListener("input", handleConversionInput);
}

/**
 * @param {InputEvent} e
*/
function handleDilutionInput(e){
    if(parseInt(e.target.value) < 1){
        this.setCustomValidity("The Dilution Factor Has To Be Greater Than or Equal to 1");
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
    const unparsedFilename = rawdata.at(-2)[0];
    const startIndex = unparsedFilename.indexOf(":")+2;
    const endIndex = unparsedFilename.indexOf(";");
    const filename = unparsedFilename.substring(startIndex, endIndex);    

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
        return [this.name, this.type, this.ys, `${this.averageY}(${this.stdev})`, this.interpolatedX.toFixed(3), this.actualX.toFixed(3), this.convertedX.toFixed(3)];
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

            //Create a light sample object for each item in the template
            lightSamples.push({name, wellNumber, wellPosition});

            //Skip over the samples labeled as none
            if(name.toLowerCase() === "none") continue;

            const type = parsedSample.get("type");
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
                    samples.set(name, {name, type, units, wellPositions:[wellPosition], wellNumbers:[wellNumber], x, ys:[y], getData, getExcelData});
                }
                else{
                    samples.set(name, {name, type, wellPositions:[wellPosition],wellNumbers:[wellNumber], ys:[y], getData, getExcelData});
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
    //If there is no template or raw data file selected return null
    if(!rawdataFile || !templateFile) return null;

    //Delete current chart & table & download anchor
    if(CHART !== null){
        CHART.destroy();
        deleteTable(tableContainer);
        window.URL.revokeObjectURL(fileContainer.firstChild.href);
        fileContainer.removeChild(fileContainer.firstChild);
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
        else regressionObject = getLinearRegression(xAndYStandards);
        const {m, b, rSquared, eq, invEq} = regressionObject;
        
        //Sort samples according to their y values
        standards.sort((first, second)=>second.averageY-first.averageY);
        unknowns.sort((first,second)=>second.averageY-first.averageY);
        const units = standards[0].units;
        
        //Interpolate the concentration of all the samples using the regression model generated
        for(let sample of samples){
            sample.interpolatedX = invEq(sample.averageY);
            sample.actualX = sample.interpolatedX*dilutionFactor;
            sample.units = units;
            sample.convertedUnits = targetUnits;
            sample.convertedX = convertConcentration(sample.actualX, units, targetUnits);
        };
        
        
        //Create chart & table
        const chartOptionsAndData = createChartOptionsAndData(unknowns, standards, rSquared, xScale, units, parsedData.filename);
        CHART = new chartjs.Chart(chartCanvas,chartOptionsAndData);
        createTable(unknowns,standards,tableContainer, units, targetUnits);

        //Create pseudoExcels in memory in order to write to excel and create downloadable link
        const psuedoExcel = createPsuedoExcel(null, null, parsedData.rawdata);
        psuedoExcel.combine(createPsuedoExcel(null, null, parsedData.template), 3, 2, false);
        const startingCol = psuedoExcel.columns;
        psuedoExcel.appendAt(0, psuedoExcel.columns, true, ["Name", "Type", "Individual Values", "Average(Stdev)", `Interpolated Concentration [${units}]`, `"Actual" Concentration [${units}]`, `Converted Concentration [${targetUnits}]`]);
        standards.forEach((standard, i, arr) => psuedoExcel.appendAt(i+1, startingCol, true, standard.getExcelData()));
        unknowns.forEach((unknown, i, arr) => psuedoExcel.appendAt(standards.length+i+1, startingCol, true, unknown.getExcelData()));

        //Add regression model parameters of best fit to pseudoExcel
        psuedoExcel.appendCol(psuedoExcel.columns, [""]);
        psuedoExcel.appendCol(psuedoExcel.columns,["R-Squared", "Slope", "Y-Intercept", "Dilution Factor"]);
        psuedoExcel.appendCol(psuedoExcel.columns,[rSquared, m, b, dilutionFactor]);


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
        m,
        b,
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
        m,
        b,
        eq,
        invEq,
        rSquared,
    }
}

}
/**
 * @param {HTMLDivElement} container  - The container that contains the table
 * @returns {null}
 */
function deleteTable(container){
    const table = document.getElementById("results-table");
    if(table) container.removeChild(table);   
    return null;
}

/**
 * @param {Sample[]} unknowns - A list of sample objects to display in the table
 * @param {Sample[]} standards - A list of sample objects to display in the table
 * @param {string} units - The units of the samples
 * @param {string} convertedUnits - The converted units of the samples
 * @param {Element} container - The element to append the table element to as a child
 * @returns {null}
 */
function createTable(unknowns, standards, container, units, convertedUnits){
    const table = document.createElement("table");
    table.id = "results-table";
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = ["Name", "Sample Type", "Average Absorbance or Luminescence",`Interpolated Concentration [${units}]`, `"Actual" Concentration [${units}]`, `Converted Concentration [${convertedUnits}]`];
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
 * @returns {chartjs.ChartConfiguration}
 */
function createChartOptionsAndData(unknowns, standards, rSquared, xScale, units, title){
    
    return {
        type:"scatter",
        data:{
            datasets:[  

                {
                    label:"Standards",
                    data:standards.map(standard => {return {x:standard.x, y:standard.averageY}}),
                },
                {
                    label:"Unknowns",
                    data: unknowns.map(sample => {return {x:sample.interpolatedX, y:sample.averageY}}),
                },
                {
                    label:`Regression Model: R-Squared: ${rSquared.toFixed(2)}`,
                    data: standards.map(standard => {return {x:standard.interpolatedX, y:standard.averageY}}),
                    showLine:true,

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
        circularDiv.style.backgroundColor = sample.name.toUpperCase()==="NONE"?"white":"";
        // circularDiv.addEventListener("click", function (event){
        //     this.firstChild.style.visibility = "hidden";
        //     this.firstChild.nextSibling.style.visibility = "hidden"; 
        //     const sampleNameInput = document.createElement("input");
        //     this.appendChild(sampleNameInput);
        //     sampleNameInput.style.zIndex = "1";
        //     this.lastChild.focus();
            
        //     sampleNameInput.addEventListener("change", event=>{
                
        //         well.sampleName = sampleNameInput.value;
        //         well.sampleColor = sampleNameInput.value.toUpperCase() === "EMPTY"?'"""RGB(255,255,255)"""':"";
        //         this.style.backgroundColor = sampleNameInput.value.toUpperCase()==="EMPTY"?"white":"";
        //         hoverText.textContent = sampleNameInput.value;
        //         try {
        //             this.removeChild(this.lastChild);
        //         } catch (error) {
        //             console.log("The focus out event has already removed the input element")
        //         }
                
        //         this.firstChild.style.visibility = "";
        //         this.firstChild.nextSibling.style.visibility = ""; 
        //     })

            // sampleNameInput.addEventListener("focusout", event=>{
            //     this.removeChild(this.lastChild);
            //     this.firstChild.style.visibility = "";             
            //     this.firstChild.nextSibling.style.visibility = "";  
            // })
            
        // })
        
        parent.appendChild(circularDiv);
    }
}


main()