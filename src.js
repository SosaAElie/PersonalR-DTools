const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const chartJsPtLabels = require("chartjs-plugin-datalabels");

//Global variable to store the reference to the created chart
let CHART = null;

/**
 * @typedef {Object} Sample
 * @property {string} name - The name of the sample
 * @property {string} type - The type of the sample i.e standard, unknown, control, etc.
 * @property {number[]} ys - The OD(s)
 * @property {number} x - The concentration
 * @property {number} interpolatedX - The interpolated concentration
 * @property {string} units - The units of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string[]} wellPositions - The wells the sample was loaded in i.e A1, B1, C1, etc.
 * @property {number} averageY - The average of y if sample was loaded in replicates 
 * @property {Function} getData - Function that returns a list of important data for the same that can be used to display in a table
 * 
*/

/**
 * @typedef {Object} RegressionObject
 * @property {number} b - The y-intercept
 * @property {number} m - The slope
 * @property {number} rSquared - The coerrelation coefficient, the closer to 1 the better the model
 * @property {CallableFunction} eq - The regression model equation, takes in x, returns y
 * @property {CallableFunction} invEq - The inverse regression model equation, takes in y returns x
 */

function main(){    
    document.getElementById("process-button").addEventListener("click", handleClick);
}

/**
 * @param {File} rawdataFile
 * @param {File} templateFile
 * @returns {Promise<Map<string, Sample>>}
 */
async function merge(rawdataFile, templateFile){
    const rawdata = await parseRawDataFile(rawdataFile);
    const rawTemplate = await parseTemplateFile(templateFile);
    const samples = new Map();
    //Grabs only the raw data assuming the data is in a 96-well plate layout
    const data = rawdata.slice(3,11).map(row => row.slice(2, -1));
    const unparsedFilename = rawdata.at(-2)[0];
    const startIndex = unparsedFilename.indexOf(":")+2;
    const endIndex = unparsedFilename.indexOf(";");
    const filename = unparsedFilename.substring(startIndex, endIndex);    

    //Grabs the names in the 96-well template
    const template = rawTemplate.slice(2,10).map(row=>row.slice(1));

    //Iterate through each inner array and create a sample, only adding the sample to the sample list if it doesn't exist already
    const rows = data.length;
    const columns = data[0].length;
    for(let i = 0; i < rows; i++){
        const columnLetter = String.fromCharCode("A".charCodeAt(0) + i);
        for(let j = 0; j < columns; j++){
            const wellPosition = columnLetter + (j+1).toString();
            const parsedSample = parseSampleName(template[i][j]);
            const y = Number(data[i][j]);            
            const name = parsedSample.get("name");
            const type = parsedSample.get("type");
            if(samples.has(name)){
                const sample = samples.get(name);
                sample.ys.push(y);
                sample.wellPositions.push(wellPosition);

            }
            else{
                if(parsedSample.has("units")){
                    const units = parsedSample.get("units");
                    const x = parsedSample.get("x");
                    samples.set(name, {name, type, units, wellPositions:[wellPosition], x, ys:[y], getData:function(){return [this.name, this.type, this.averageY, this.interpolatedX]}})
                }
                else{
                    samples.set(name, {name, type, wellPositions:[wellPosition], ys:[y], getData:function(){return [this.name, this.type, this.averageY, this.interpolatedX]}})
                }
            }
        }
    }
    //Iterate through the samples after they have all been mapped and add the averageY property
    samples.forEach((v,k, m) => v.averageY = ss.average(v.ys));

    //Provide the filename so that it can be used to create the results xlsx file
    // samples.set("filename", filename);
    return samples;
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
    if(CHART !== null) CHART.destroy()
    if(!rawdataFile || !templateFile) return;
    merge(rawdataFile, templateFile)
    .then(allSamples =>{
        const samples = Array.from(allSamples.values());
        const standards = samples.filter(sample => sample.type === "standard");
        const unknowns = samples.filter(sample => sample.type === "sample");
        const xAndYStandards = standards.map(standard => [standard.x, standard.averageY]);
        let regressionObject;
        //Get user inputs for x-scale type and regression type
        const xScale = getSelectedRadioButton(document.getElementById("x-scale"));
        const regressionType = getSelectedRadioButton(document.getElementById("regression-inputs"));

        //Obtain the parameters of best fit using selected regression type
        if(regressionType === "log") regressionObject = getLogRegression(xAndYStandards);
        else regressionObject = getLinearRegression(xAndYStandards);
        const {m, b, rSquared, eq, invEq} = regressionObject;

        //Interpolate the concentration of all the samples using the regression model generated
        for(let sample of samples) sample.interpolatedX = invEq(sample.averageY);        

        //Create chart
        const chartOptionsAndData = createChartOptionsAndData(unknowns, standards, rSquared, xScale);
        CHART = new chartjs.Chart(chartCanvas,chartOptionsAndData);

        //Create table with the results
        deleteTable(tableContainer);
        createTable(samples, tableContainer);
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
    console.log(logXYValues);
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
 * @param {Sample[]} samples - A list of sample objects to display in the table
 * @param {Element} container - The element to append the table element to as a child
 * @returns {null}
 */
function createTable(samples, container){
    const table = document.createElement("table");
    table.id = "results-table";
    const headerContainer = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const headers = ["Sample Name", "Sample Type", "Average Y","Interpolated Protein Concentration"];
    for(let header of headers){
        const row = document.createElement("th");
        row.textContent = header;
        headerRow.appendChild(row);
    }


    const body = document.createElement("tbody");
    headerContainer.appendChild(headerRow);
    for(let sample of samples){        
        const row = document.createElement("tr");
        for (let data of sample.getData()){
            const td =document.createElement("td");
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
 * @returns {Object}
 */
function createChartOptionsAndData(unknowns, standards, rSquared, xScale){
    
    return {
        type:"scatter",
        data:{
            datasets:[
                {
                    label:"Standards",
                    data:standards.map(standard => {return {x:standard.x, y:standard.averageY}}),
                },
                {
                    label:`Regression Model: R-Squared: ${rSquared.toFixed(3)}`,
                    data: standards.sort((first, second)=>first.averageY-second.averageY).map(standard => {return {x:standard.interpolatedX, y:standard.averageY}}),
                    showLine:true,
                },
                {
                    label:"Unknowns",                        
                    data: unknowns.map(sample => {return {x:sample.interpolatedX, y:sample.averageY}}),
                }
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
                        text:"Protein [ug/mL]",
                    },
                },
                y:{
                    position:"left",
                    title:{
                        display:true,
                        text:"Absorbance @ 562nm"
                    }                        
                }
            },
            plugins:{
                title:{
                    display:true,
                    text: `${new Date().getMonth()}/${new Date().getDate()}/${new Date().getFullYear()} Interpolation of Unknowns Using Linear Regression`,
                },                   
            }
        }
    }
}

main()