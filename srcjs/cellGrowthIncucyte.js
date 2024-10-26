const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const xlsx = require("xlsx");

/**
 * @typedef {Object} Sample
 * @property {string} name
 * @property {string} columnIndices
 * @property {Map<number, TimePoint>} timecourse
 */

/**
 * @typedef {Object} TimePoint
 * @property {string} dateAndTime
 * @property {number} hour
 * @property {number[]} replicates
 * @property {number} average
 * @property {number} stdev
 */

function main(){
    document.getElementById("rawdata-input").addEventListener("input", handleRawDataFileInput)
}

/**
 * @param {InputEvent} e
 * @return {null}
 */
async function handleRawDataFileInput(e){
    /**
     * @type {FileList}
     */
    const files = e.target.files;
    if(files.length <= 0) return;
    const rawDataFile = files[0];
    const rawData = await parseDelimitedFile(rawDataFile);
    console.log(rawData);
    processRawData(rawData);

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
 * @param {string[][]} rawdata
 * @return {Map<string, Sample>}
 */
function processRawData(rawdata){
    const metaDataIndex = rawdata.findIndex((val, index, obj) => val[0] === "");
    /**
     * @type {Map<string,Sample>}
     */
    const samples = new Map();
    const dateTimeIndex = 0;
    const hoursElapsedIndex = 1;
    //Assume that the first row of the data is represetative of all the subsequent rows of the data
    const rowWidth = rawdata[metaDataIndex+1].length;

    //Iterate through the doubly nested array, skipping over the metadata at the beginning if there is any
    //Skip the last line of the data as well, since there should only be an empty string there
    for(let y = 0; y < rowWidth; y++){
        const sampleName = rawdata[metaDataIndex+1][y];
        if(samples.has(sampleName)){
            var sample = samples.get(sampleName);
        }
        else{
            var sample = createSample(sampleName);
        }
        for(let x = metaDataIndex+2; x < rawdata.length-1; x++){
            
            const dateTime = rawdata[x][dateTimeIndex];
            const hoursElapsed = rawdata[x][hoursElapsedIndex];
            const cellCount = rawdata[x][y];

        }
    }
}
/**
 * @param {string} name 
 * @returns {Sample}
 */
function createSample(name){
    return ({
        name,
        columnIndices:[],
        timecourse: new Map(),
    });
}

main()