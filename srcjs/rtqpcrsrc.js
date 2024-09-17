const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const xlsx = require("xlsx");

/**
 * @typedef {Object} Sample
 * @property {string} name - Sample name
 * @property {Map<string, Target>} targets - The target genes
 * @property {number[]} wells - The well numbers the sample was loaded in i.e 1,2,3...384
 * @property {string[]} wellPositions - The well positions the sample was loaded in i.e A1, B1, C1, etc.
 * 
*/

/**
 * @typedef {Object} Target
 * @property {string} name - Target gene name
 * @property {string} reporter - The associated fluorescent reporter
 * @property {number[]} cqs - The associated Ct/Cq values
 * @property {number[]} bestDuplicates - The best duplicates out of the total replicates in a run
 * @property {number} average - The average of the best duplicates
 * @property {number} stdev - The sample standard deviation of the best duplicate
 * @property {number} deltaCt - ct (gene of interest) - ct (housekeeping gene)
 * @property {number} deltadeltaCt - ΔCt (unknown sample/target sample) - ΔCt (reference sample/control sample)
 * @property {number} rge - Relative Gene Expression
 * @property {string} hkg - House Keeping Gene
 * @property {number} pcrEfficiency - The PCR efficiency of the target gene, default is 1
 */

/**
 * @returns {null}
 */
function main(){
    document.getElementById("rawdata-input").addEventListener("input",processResultsCsv);
    document.getElementById("rawdata-input").addEventListener("input", updateLabel);
}

/**
 * @param {InputEvent} e
 */
async function processResultsCsv(e){
    if(e.target.files ===  null) return;
    const inputfile = e.target.files[0];
    const rawdata = await parseDelimitedFile(inputfile);
    const samples = createSamples(rawdata);
    if(samples.length <= 0) return;
    updateSelectUis(samples);
}

/**
 * @param {Map<string, Sample>} samples
 * @returns {null}
 */
function updateSelectUis(samples){
    const selectEleTargets = document.getElementById("reference-gene");
    const samplesArr = Array.from(samples.values());
    for(let target of samplesArr[0].targets.keys()){
        const optionEle = document.createElement("option");
        optionEle.text = target;
        selectEleTargets.appendChild(optionEle);
    }
    
    const selectEleSamples = document.getElementById("reference-sample");
    for(let sample of samplesArr){
        const optionEle = document.createElement("option");
        optionEle.text = sample.name;
        selectEleSamples.appendChild(optionEle);
    }

    selectEleSamples.addEventListener("change", handleReferenceSampleChange)
    selectEleTargets.addEventListener("change", handleReferenceTargetChange)
    return null;
}

/**
 * @param {Event} e
 */
function handleReferenceTargetChange(e){
    console.log(e.target.value);
}

/**
 * @param {Event} e
 */
function handleReferenceSampleChange(e){
    console.log(e.target.value);
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
 * @returns {Map<string, Sample>}
 */
function createSamples(rawdata){
    const importantHeaders = ["Sample", "Target", "Well", "Well Position", "Reporter", "Cq"];
    const minLength = 20;
    const samples = new Map();
    const headerIndices = [];
    let foundHeaders = false;
    for(let arr of rawdata){
        //Find the header row to determine the indices for the important headers, store in a map
        if(arr.length > minLength && arr.includes(importantHeaders[0])){
            foundHeaders = true;
            for(let importantHeader of importantHeaders) headerIndices.push(arr.indexOf(importantHeader));
            continue;
        }

        //Once the headers are found and the length of the array is also appropriate create Sample or Target object
        //If Sample does not exist create Sample & Target objects
        //If Sample exists and Target does not, create Target object
        //If Sample and Target exists append well & well position to Sample (if necessary) & Cq to Target cqs
        if(arr.length > minLength && foundHeaders){
            const sampleData = [];
            for(let i = 0; i < headerIndices.length; i++){
                if(importantHeaders[i] === "Well" || importantHeaders[i] === "Cq" ){
                    sampleData.push(parseFloat(arr[headerIndices[i]]));
                }
                else{
                    sampleData.push(arr[headerIndices[i]]);
                }
            };
            if(!samples.has(sampleData[0])){
                const target = createTarget(sampleData[1], sampleData[4], sampleData[5]);
                const sample = createSample(sampleData[0], target, sampleData[2], sampleData[3]);
                samples.set(sample.name, sample);
            }
            else{
                const sample = samples.get(sampleData[0]);
                if(!sample.targets.has(sampleData[1])){
                    const target = createTarget(sampleData[1], sampleData[4], sampleData[5]);
                    sample.targets.set(target.name, target);                    
                }
                else{
                    sample.targets.get(sampleData[1]).cqs.push(sampleData[5]);
                }

                if(sample.wells.indexOf(sampleData[2]) < 0 && sample.wells.indexOf(sampleData[3]) < 0){
                    sample.wells.push(sampleData[2]);
                    sample.wellPositions.push(sampleData[3]);
                }
            }
        }
    }
    return samples;
}

/**
 * @param {string} name
 * @param {Target} target
 * @param {number} well
 * @param {string} wellPosition
 * @return {Sample}
 */
function createSample(name, target, well, wellPosition){
    return {
        name,
        targets:new Map([[target.name, target]]),
        wells:[well],
        wellPositions:[wellPosition],
    }
}

/**
 * @param {string} name
 * @param {string} reporter
 * @param {number} cq
 * @return {Target}
 */
function createTarget(name, reporter, cq){
    return{
        name,
        reporter,
        cqs:[cq],
        bestDuplicates:[],
        average:NaN,
        stdev:NaN,
        deltaCt:NaN,
        deltadeltaCt:NaN,
        rge:NaN,
        hkg:"",
        pcrEfficiency:1,
    }
}

main()