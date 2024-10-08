const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const papa = require("papaparse");
const xlsx = require("xlsx");

let CHART = null;
/**
 * @typedef {Object} Sample
 * @property {string} name - Sample name
 * @property {Map<string, Target>} targets - The target genes
 * @property {number[]} wells - The well numbers the sample was loaded in i.e 1,2,3...384
 * @property {string[]} wellPositions - The well positions the sample was loaded in i.e A1, B1, C1, etc.
 * @property {Target|null} hkg - House Keeping Gene
 * @property {Target|null} goi - Gene of Interest
 * @property {boolean} isRefSample - returns true if this sample is selected to the be the reference sample
 * @property {number} refSampleCount - The number of samples that this sample is a reference sample for
 * @property {function} getTableData - returns an array containing data to display on a table
 * @property {Sample} refSample - The reference sample that is used to calculate the ΔΔCt for this sample
 * @property {string} color - The color that the bar in the bar graph will be to represent this sample
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
 * @property {number} deltadeltaCt - ΔCt (unknown sample or target sample) - ΔCt (reference sample or control sample)
 * @property {number} rge - Relative Gene Expression, 2^-ΔΔCt
 * @property {number} pcrEfficiency - The PCR efficiency of the target gene, default is 1
 */

/**
 * @typedef {Object} LightweightSample
 * @property {string} wellPosition - The well position the sample was loaded in
 * @property {number} wellNumber - The well number the same was loaded in
 * @property {string} name - The name of the sample
 */


/**
 * @returns {null}
 */
function main(){
    document.getElementById("rawdata-input").addEventListener("input",processResultsCsv);
    document.getElementById("rawdata-input").addEventListener("input", updateLabel);
    document.getElementById("reference-gene").addEventListener("change", handleHkgTargetChange);
    document.getElementById("gene-of-interest").addEventListener("change", handleGoiChange);
    document.getElementById("download-excel").addEventListener("click", handleDownloadExcelClick);
}

/**
 * @param {InputEvent} e
 */
async function processResultsCsv(e){
    //If no file is selected immediately return with no changes to the UI
    if(e.target.files.length <= 0) return;
    if(CHART !== null){
        CHART.destroy();
        document.getElementById("diagram384").innerHTML = "";
        document.getElementById("sample-table").innerHTML = "";
    }

    //ToDo Add another check to ensure that the file being passed in is an unedited results file from an
    //Applied BioSystems QuantStudio 7 Pro
    const inputfile = e.target.files[0];
    const rawdata = await parseDelimitedFile(inputfile);
    const samples = createSamples(rawdata);
    if(samples.length <= 0) return;
    updateSampleAverageStdev(samples);

    const lightweightSamples = createLightWeightSamples(samples);
    const templateDiagram = document.getElementById("diagram384");
    diagram384Well(lightweightSamples, templateDiagram, inputfile.name);
    
    updateSelectUiWithGenes(samples, "reference-gene");
    updateSelectUiWithGenes(samples, "gene-of-interest");
    createSampleTable(samples, inputfile.name);

    const canvas = document.getElementById("canvas");
    CHART = new chartjs.Chart(canvas, createRgeBarGraphOptions(samples, inputfile.name));
    document.getElementById("rge-charts").appendChild(canvas);

}

/**
 * @param {Sample[]} samples
 * @param {string} filename
 * @returns {null}
 */
function createSampleTable(samples, filename){
    const container = document.getElementById("sample-table");
    const table = document.createElement("table");
    const tableHeaders = document.createElement("thead");
    const tableBody = document.createElement("tbody");

    //Create table title
    const title = document.createElement("caption");
    title.textContent = filename;
    title.id = "filename";
    table.appendChild(title);
    
    const headers = ["Sample Name", "Gene of Interest", "House-Keeping Gene", "GOI Average Ct", "GOI Stdev", "Reference Sample", "ΔCt", "ΔΔCt", "Relative Gene Expression"];
    const headerRow = document.createElement("tr");
    for(let header of headers){
        const th = document.createElement("th");
        th.textContent = header;
        headerRow.appendChild(th);
    }
    tableHeaders.appendChild(headerRow);
    table.appendChild(tableHeaders);
    const selectRefSampleEle = createSelectRefSampleEle(samples);
    for(let sample of samples){
        const row = document.createElement("tr");
        row.className = "samples";
        row.id = sample.name;
        row.sample = sample;
        const sampleTableData = sample.getTableData();
        for(let j = 0; j < sampleTableData.length; j++){
            const header = headers[j];
            const td = document.createElement("td");
            if(header === "Reference Sample"){
                const selectEle = selectRefSampleEle.cloneNode(true);
                selectEle.addEventListener("change", e =>{
                    const userSelectedRefSample = e.target.value;
                    if(userSelectedRefSample === "None" || sample.hkg.name === "") return;
                    const refSample = samples.find((val, ind, obj)=> val.name === userSelectedRefSample);
                    refSample.isRefSample = true;
                    refSample.color = "#E7F0DC"
                    refSample.refSampleCount++;
                    const prevRefSample = sample.refSample;
                    if(prevRefSample !== null){
                        prevRefSample.refSampleCount--;
                        if(prevRefSample.refSampleCount === 0){
                            prevRefSample.color = "rgba(255, 105, 105, 1)";
                            prevRefSample.isRefSample = false;
                        }
                    } 
                    sample.refSample = refSample;
                    sample.goi.deltadeltaCt = sample.goi.deltaCt - refSample.goi.deltaCt;
                    sample.goi.rge = 2**(-sample.goi.deltadeltaCt);
                    document.getElementById(`${sample.name}-ΔΔCt`).textContent = sample.goi.deltadeltaCt.toFixed(2);
                    document.getElementById(`${sample.name}-Relative Gene Expression`).textContent = sample.goi.rge.toFixed(2);
                    CHART.data.datasets[0].data = samples.map(sample => sample.goi.rge);
                    CHART.data.datasets[0].backgroundColor = samples.map(sample => sample.color);
                    CHART.update();
                })
                td.appendChild(selectEle);
            }
            else{
                td.textContent = sampleTableData[j];
                td.id = `${sample.name}-${header}`
            }
            row.appendChild(td);
        }
        tableBody.appendChild(row);
    }
    table.appendChild(tableBody);
    container.appendChild(table);

}

/**
 * @param {Sample[]} samples
 */
function createSelectRefSampleEle(samples){
    const selectEle = document.createElement("select");
    const noneOptionEle = document.createElement("option");
    noneOptionEle.textContent = "None";
    selectEle.appendChild(noneOptionEle);
    for(let sample of samples){
        const optionEle = document.createElement("option");
        optionEle.textContent = sample.name;
        selectEle.appendChild(optionEle);
    }
    return selectEle;
}

/**
 * @param {Sample[]} samples
 * @return {LightweightSample[]}
 */
function createLightWeightSamples(samples){
    const lws = new Map();
    let wellPositionLetter = "A"
    for(let i = 1; i < 385; i++){
        let wellPositionNumber = i%24;
        if(wellPositionNumber === 0) wellPositionNumber = 24;
        lws.set(i, {name:"None", wellPosition:`${wellPositionLetter}${wellPositionNumber}`, wellNumber:i});
        if(i%24 === 0) wellPositionLetter = String.fromCharCode((wellPositionLetter.charCodeAt(0)+1));
    }
    for(let sample of samples){
        for(let i = 0; i < sample.wellPositions.length; i++){
            lws.set(sample.wells[i], {name:sample.name, wellPosition:sample.wellPositions[i], wellNumber:sample.wells[i]});
        }
    }
    return Array.from(lws.values());
}

/**
 * @param {Sample[]} samples
 * @param {string} id - The id of the select element to update
 * @returns {null}
 */
function updateSelectUiWithGenes(samples, id){
    const selectEleTargets = document.getElementById(id);
    selectEleTargets.innerHTML = "";
    const noneOptionEle = document.createElement("option");
    noneOptionEle.textContent = "None";
    selectEleTargets.appendChild(noneOptionEle);
    //Makes the assumption that the first sample in the samples array is representative of all the samples
    for(let target of samples[0].targets.keys()){
        const optionEle = document.createElement("option");
        optionEle.text = target;
        selectEleTargets.appendChild(optionEle);
    }
    return null;
}

/**
 * @param {Sample[]} samples
 * @param {string} filename
 * @param {string} goi
 * @returns {chartjs.ChartConfiguration}
 */
function createRgeBarGraphOptions(samples, filename){
    return {
        type:"bar",
        data:{
            labels:samples.map(sample => sample.name),
            datasets:[
                {
                    label:"Relative Gene Expression",
                    data:samples.map(sample=>sample.goi === null?0:sample.goi.rge),
                    backgroundColor:samples.map(sample => sample.color),
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
                    type:"linear",
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
                        text:`Relative Gene Expression of GOI`,
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
                    text: filename,
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
 * @param {Event} e
 */
function handleDownloadExcelClick(e){
    const sampleElements = document.getElementsByClassName("samples");
    if(sampleElements.length <= 0) return;

    const excelData = [["Sample Name", "is Reference Sample?", "Gene of Interest", "House-Keeping Gene", "Replicates", "Best Duplicates", "GOI Average Ct", "GOI Stdev","Reference Sample", "ΔCt", "ΔΔCt", "Relative Gene Expression"]];
    const filename = document.getElementById("filename").textContent;
    for(let sampleEle of sampleElements){
        const sample = sampleEle.sample;
        const sampleName = sample.name;
        const isReferenceSample = sample.isRefSample;
        const hkg = sample.hkg;
        const goi = sample.goi;
        const refSample = sample.refSample;

        if(hkg.name === "" || goi.name === "") continue;

        const replicates = goi.cqs.map(cq => cq.toFixed(2)).join(",");
        const bestDuplicates = goi.bestDuplicates.map(x => x.toFixed(2)).join(",");
        const average = goi.average.toFixed(2);
        const stdev = goi.stdev.toFixed(2);
        const deltaCt = goi.deltaCt.toFixed(2);
        const deltadeltaCt = goi.deltadeltaCt.toFixed(2);
        const rge = goi.rge.toFixed(2);
        excelData.push([sampleName, isReferenceSample, goi.name, hkg.name, replicates, bestDuplicates, average, stdev, refSample === null?"":refSample.name, deltaCt, deltadeltaCt, rge]);
    }

    //Create excel object in memory
    const wkbk = createWkbk(excelData, "results");
    const binaryData = xlsx.write(wkbk, {bookType:"xlsx", type:"buffer"});
    const blob = new Blob([binaryData], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

     //Create a download link and associated anchor element
    const link = window.URL.createObjectURL(blob);
    const anchorElem = document.createElement("a");
    anchorElem.href = link;
    anchorElem.download = filename.replace(".csv", ".xlsx");

    //Prevent the bubbling of the click event that is initiated when the parent button element is clicked
    anchorElem.addEventListener("click", e => e.stopPropagation())
    anchorElem.click();

    //Clean up
    window.URL.revokeObjectURL(link);
}   

/**
 * @param {Event} e
 * @return {null}
 */
function handleHkgTargetChange(e){
    const hkgName = e.target.value;
    if(hkgName === "None") return;

    //All tr elements should have the class name "samples" 
    //and should have a property that references the sample object they represent in the table
    const sampleEles = document.getElementsByClassName("samples");

    //Calculate the ΔCt value for each non-reference gene of each sample
    for(let sampleEle of sampleEles){
        /**
         * @type {Sample}
         */
        const sample = sampleEle.sample;
        const hkg = sample.targets.get(hkgName);
        if(hkg === undefined){
            console.log(`Error: Gene of Interest not present for this sample: ${sample.name}`);
            continue;
        };
        sample.hkg = hkg;
        document.getElementById(`${sample.name}-House-Keeping Gene`).textContent = hkg.name;

        if(sample.goi === null) continue;
        const goi = sample.goi;
        goi.deltaCt = goi.average - hkg.average;
        const sampleName = sample.name;
        document.getElementById(`${sampleName}-ΔCt`).textContent = goi.deltaCt.toFixed(2);
        document.getElementById(`${sampleName}-GOI Average Ct`).textContent = goi.average.toFixed(2);
        document.getElementById(`${sampleName}-GOI Stdev`).textContent = goi.stdev.toFixed(2);
    }
    return null;
}
/**
 * @param {Event} e
 * @return {null}
 */
function handleGoiChange(e){
    const goiName = e.target.value;
    if(goiName === "None") return;

    //All tr elements should have the class name "samples" 
    //and should have a property that references the sample object they represent in the table
    const sampleEles = document.getElementsByClassName("samples");

    //Calculate the ΔCt value for each non-reference gene of each sample
    for(let sampleEle of sampleEles){
        /**
         * @type {Sample}
         */
        const sample = sampleEle.sample;
        const sampleName = sample.name;
        const goi = sample.targets.get(goiName);
        if(goi === undefined){
            console.log(`Error: Gene of Interest not present for this sample: ${sample.name}`);
            continue;
        };
        sample.goi = goi;
        document.getElementById(`${sample.name}-Gene of Interest`).textContent = goi.name;
        
        if(sample.hkg === null) continue;
        goi.deltaCt = goi.average - sample.hkg.average;
        document.getElementById(`${sampleName}-ΔCt`).textContent = goi.deltaCt.toFixed(2);
        document.getElementById(`${sampleName}-GOI Average Ct`).textContent = goi.average.toFixed(2);
        document.getElementById(`${sampleName}-GOI Stdev`).textContent = goi.stdev.toFixed(2);
    }
    return null;
}

/**
 * @param {Sample[]} samples
 * @return {null}
 */
function updateSampleAverageStdev(samples){
    //Mutates the sample objects in the sample map by updating the average, stdev, bestDuplicates properties of the Target object property of the Sample
    for(let sample of samples){
        for(let target of sample.targets.values()){
            target.bestDuplicates = getBestDuplicates(target.cqs);
            target.average = ss.mean(target.bestDuplicates);
            if(target.cqs.length > 1) target.stdev = ss.sampleStandardDeviation(target.bestDuplicates);
            else target.stdev = NaN;
        }
    }
    return null
}

/**
 * @param {number[]} replicates
 * @return {number[]}
 */
function getBestDuplicates(replicates){
    if(replicates.length < 2) return replicates.map(x=>x);
    const duplicates = [];
    const diffs = [];
    for(let i = 0; i < replicates.length-1; i++){
        for(let j = i+1; j < replicates.length; j++){
            diffs.push(Math.abs(replicates[i]-replicates[j]));
            duplicates.push([replicates[i], replicates[j]])
        }
    }

    return duplicates.at(diffs.indexOf(ss.min(diffs)));
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
    return Array.from(samples.values());
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
        hkg:null,
        goi:null,
        isRefSample:false,
        refSample:null,
        refSampleCount:0,
        color:"rgba(255, 105, 105, 1)",
        /**
         * 
         * @param {string} targetName 
         * @returns {string[]|number[]}
         */
        getTableData(targetName = null){
            return (
                targetName === null?
                [this.name, "", "", "","","","","",""]
                :
                [this.name, this.targets.get(targetName).name, this.hkg.name, this.targets.get(targetName).average,this.targets.get(targetName).stdev, this.refSample.name, this.targets.get(targetName).deltaCt, this.targets.get(targetName).deltadeltaCt, this.targets.get(target).rge]
            
            )
        },
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
        pcrEfficiency:1,
    }
}

function createWkbk(data, sheetname = "sheet1"){
    const wkbk = xlsx.utils.book_new();
    const wkst = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wkbk, wkst, sheetname);
    return wkbk;
}

/** 
 * @param {LightweightSample[]} lightSamples
 * @param {Element} parent
 * @param {string} diagramTitle
 * @returns {void}
**/
function diagram384Well(lightSamples, parent, diagramTitle){
    const title = document.createElement("h3");
    title.id = "diagram-title384";
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
        parent.appendChild(circularDiv);
    }
}

main()