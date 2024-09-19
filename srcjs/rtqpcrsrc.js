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
 * @property {Target} hkg - House Keeping Gene
 * @property {Target} goi - Gene of Interest
 * @property {boolean} isRefSample - returns true if this sample is selected to the be the reference sample
 * @property {function} getTableData - returns an array containing data to display on a table
 * @property {Sample} refSample - The reference sample that is used to calculate the ΔΔCt for this sample
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
    document.getElementById("reference-gene").addEventListener("change", handleRefTargetChange);
    document.getElementById("gene-of-interest").addEventListener("change", handleGoiChange);

}

/**
 * @param {InputEvent} e
 */
async function processResultsCsv(e){
    //If no file is selected immediately return with no changes to the UI
    if(e.target.files ===  null) return;

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
    createSampleTable(samples)

}

/**
 * @param {Sample[]} samples
 * @returns {null}
 */
function createSampleTable(samples){
    const container = document.getElementById("sample-table");
    
    const table = document.createElement("table");
    const tableHeaders = document.createElement("thead");
    const tableBody = document.createElement("tbody");

    
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
                    sample.refSample = refSample;
                    sample.goi.deltadeltaCt = sample.goi.deltaCt - refSample.goi.deltaCt;
                    sample.goi.rge = 2**(-sample.goi.deltadeltaCt);
                    document.getElementById(`${sample.name}-ΔΔCt`).textContent = sample.goi.deltadeltaCt.toFixed(2);
                    document.getElementById(`${sample.name}-Relative Gene Expression`).textContent = sample.goi.rge.toFixed(2);

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

    //Makes the assumption that the first sample in the samples array is representative of all the samples
    for(let target of samples[0].targets.keys()){
        const optionEle = document.createElement("option");
        optionEle.text = target;
        selectEleTargets.appendChild(optionEle);
    }
    return null;
}

/**
 * @param {Event} e
 * @param {Map<string, Sample>} samples
 * @param {string} filename
 */
function handleProcessSelectionClick(e, samples, filename){
    const rgeCharts = document.getElementById("rge-charts");

    if(CHARTS.length > 0){
        for(let chart of CHARTS) chart.destroy();
        rgeCharts.innerHTML = "";
    }

    const referenceTarget = document.getElementById("reference-gene").value;
    const referenceSample = document.getElementById("reference-sample").value;
    if(referenceTarget === "None" || referenceSample === "None") return;

    //Replace the button element to remove all event listeners
    document.getElementById("download-excel").replaceWith(document.getElementById("download-excel").cloneNode(true));

    //Calculate the relative gene expression for each target gene
    for(let sample of samples.values()){
        for(let target of sample.targets.values()){
            target.rge = 2**(-target.deltadeltaCt);
        }
    }

    //Create a bar graph to show the relative gene expression for each sample
    const targets = Array.from(samples.get(referenceSample).targets.values());
    for(let target of targets){
        if(target.name === referenceTarget) continue;
        const canvas = document.createElement("canvas");
        const chartOptions = createRgeBarGraphOptions(samples, filename, target.name, referenceSample);
        CHARTS.push(new chartjs.Chart(canvas, chartOptions));
        rgeCharts.appendChild(canvas);

    }

    //Add event listener to download excel button to allow user to download excel file when they click it, anonymous function so it can refernce the samples
    document.getElementById("download-excel").addEventListener("click", e => handleDownloadExcelClick(e, samples, filename));
}

/**
 * @param {Map<string, Sample>} samples
 * @param {string} filename
 * @param {string} goi
 * @returns {chartjs.ChartConfiguration}
 */
function createRgeBarGraphOptions(samples, filename, goi){
    const sorted = Array.from(samples.values()).map(sample => {
        return {
            name:sample.name, 
            rge:sample.targets.get(goi).rge,
        }
    }).sort((a,b) => a.rge - b.rge);

    return {
        type:"bar",
        data:{
            labels:sorted.map(x => x.name),
            datasets:[
                {
                    label:"Relative Gene Expression",
                    data:sorted.map(x=>x.rge),
                    backgroundColor:"rgba(255, 105, 105, 0.56)",
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
                        color:"white",
                        tickColor:"white",
                    },
                    ticks:{
                        textStrokeColor:"white",
                        color:"white",
                    },
                    
                },
                y:{
                    type:"linear",
                    position:"left",
                    grid:{
                        color:"white",
                        tickColor:"white",
                    },
                    ticks:{
                        textStrokeColor:"white",
                        color:"white",
                    },
                    title:{
                        display:true,
                        text:`RGE of ${goi}`,
                        font:{
                            size:18,
                            weight:"bold",
                        },
                        color: "white", 
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
                    color: "white",
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
 * @param {Map<string, Sample>} samples
 * @param {string} filename
 */
function handleDownloadExcelClick(e, samples, filename){
    const excelData = [["Sample Name", "is Reference Sample?", "Gene of Interest", "House-Keeping Gene", "Replicates", "Best Duplicates", "GOI Average Ct", "GOI Stdev","Reference Sample", "ΔCt", "ΔΔCt", "Relative Gene Expression"]];
    for(let sample of samples.values()){
        const sampleName = sample.name;
        const isReferenceSample = sample.isRefSample;
        const hkg = sample.hkg;
        for(let target of sample.targets.values()){
            if(target.name === hkg.name) continue;
            const targetName = target.name;
            const replicates = target.cqs.map(cq => cq.toFixed(2)).join(",");
            const bestDuplicates = target.bestDuplicates.map(x => x.toFixed(2)).join(",");
            const average = target.average.toFixed(2);
            const stdev = target.stdev.toFixed(2);
            const deltaCt = target.deltaCt.toFixed(2);
            const deltadeltaCt = target.deltadeltaCt.toFixed(2);
            const rge = target.rge.toFixed(2);
            excelData.push([sampleName, isReferenceSample, targetName, hkg.name, replicates, bestDuplicates, average, stdev, deltaCt, deltadeltaCt, rge]);
        }
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
function handleRefTargetChange(e){
    const refGeneName = e.target.value;
    if(refGeneName === "None") return;

    //All tr elements should have the class name "samples" 
    //and should have a property that references the sample object they represent in the table
    const sampleEles = document.getElementsByClassName("samples");

    //Calculate the ΔCt value for each non-reference gene of each sample
    for(let sampleEle of sampleEles){
        const sample = sampleEle.sample;
        const refGene = sample.targets.get(refGeneName);
        if(refGene === undefined){
            console.log("Error: Reference target not present for this sample");
            return;
        };
        sample.hkg = refGene;
        document.getElementById(`${sample.name}-House-Keeping Gene`).textContent = refGene.name;
        for(let [geneName, gene] of sample.targets.entries()){
            gene.deltaCt = gene.average - refGene.average;
            if(geneName !== refGeneName){
                document.getElementById(`${sample.name}-ΔCt`).textContent = gene.deltaCt.toFixed(2);
                document.getElementById(`${sample.name}-Gene of Interest`).textContent = gene.name;
                document.getElementById(`${sample.name}-GOI Average Ct`).textContent = gene.average.toFixed(2);
                document.getElementById(`${sample.name}-GOI Stdev`).textContent = gene.stdev.toFixed(2);
                sample.goi = gene;
            }
        }
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
        const sample = sampleEle.sample;
        const goi = sample.targets.get(goiName);
        if(goi === undefined){
            console.log("Error: Gene of Interest not present for this sample");
            return;
        };
        sample.goi = goi;
        document.getElementById(`${sample.name}-Gene of Interest`).textContent = goi.name;
        
        if(sample.hkg.name === "") continue;
        sample.goi.deltaCt = sample.hkg.average - goi.average;
        document.getElementById(`${sample.name}-ΔCt`).textContent = sample.goi.deltaCt.toFixed(2);
        document.getElementById(`${sample.name}-GOI Average Ct`).textContent = sample.goi.average.toFixed(2);
        document.getElementById(`${sample.name}-GOI Stdev`).textContent = sample.goi.stdev.toFixed(2);
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
 * @param {Event||string} e
 * @param {Map<string, Sample>} samples
 * @return {null}
 */
function handleReferenceSampleChange(e, samples){
    let referenceSampleName;
    if(typeof e === "string") referenceSampleName = e;
    else referenceSampleName = e.target.value;
    if(referenceSampleName === "None") return;
    const referenceSample = samples.get(referenceSampleName);
    if(referenceSample === undefined) return;

    ///Calculate the ΔΔCt value for each non-reference gene of each non-reference sample
    for(let sample of samples.values()){
        if(sample.name === referenceSampleName) sample.isRefSample = true;
        else sample.isRefSample = false;
        for(let [k, v] of sample.targets.entries()){
            v.deltadeltaCt = v.deltaCt - referenceSample.targets.get(k).deltaCt;
        }
    }
    return null
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
        hkg:createTarget("", "", NaN),
        isRefSample:false,
        refSample:null,
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