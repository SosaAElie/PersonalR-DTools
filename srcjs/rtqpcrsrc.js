const ss = require("simple-statistics");
const chartjs = require("chart.js/auto");
const xlsx = require("xlsx");
const classes = require("../classes/classes.js");
const helpers = require("../utils/helpers.js");
let CHART = null;

/**
 * @typedef {Object} LightweightSample
 * @property {string} wellPosition - The well position the sample was loaded in
 * @property {number} wellNumber - The well number the same was loaded in
 * @property {string} name - The name of the sample
 * @property {string} color - The color of the target
 * @property {string} targetName - The name of the target
 */


/**
 * @returns {null}
 */
function main(){
    document.getElementById("rawdata-input").addEventListener("input",processResultsCsv);
    document.getElementById("rawdata-input").addEventListener("input", updateLabel);
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
        document.getElementById("results-summary-container").innerHTML = "";
        document.getElementById("rge-container").innerHTML = "";
    }

    //ToDo Add another check to ensure that the file being passed in is an unedited results file from an
    //Applied BioSystems QuantStudio 7 Pro
    const inputfile = e.target.files[0];
    const rawdata = await helpers.parseDelimitedFile(inputfile);
    const samplesAndTargets = createSamplesAndTargets(rawdata);
    const samples = samplesAndTargets.get("samples"); 
    const targets = samplesAndTargets.get("targets"); 
    const targetColors = samplesAndTargets.get("colors"); 
    if(samples.length <= 0) return;
    updateSampleAverageStdev(samples);

    const lightweightSamples = createLightWeightSamples(samples);
    const templateDiagram = document.getElementById("diagram384");
    diagram384Well(lightweightSamples, templateDiagram, inputfile.name);
    
    const resultsSummaryContainer = document.getElementById("results-summary-container");
    const rgeContainer = document.getElementById("rge-container");
    createResultsTable(samples, targets, targetColors, inputfile.name, resultsSummaryContainer);
    createRgeTable(samples, targets, inputfile.name, rgeContainer);

    // const canvas = document.getElementById("canvas");
    // CHART = new chartjs.Chart(canvas, createRgeBarGraphOptions(samples, inputfile.name));
    // document.getElementById("rge-charts").appendChild(canvas);

}

/**
 * @param {classes.RtqpcrSample[]} samples
 * @param {string[]} targets
 * @param {string} title
 * @param {HTMLElement} container
 * @returns {null}
 */
function createRgeTable(samples, targets, title, container){
    const table = document.createElement("table");
    const tableHeaders = document.createElement("thead");
    const tableBody = document.createElement("tbody");
    targets = ["None", ...targets];

    //Create table title
    const tableTitle = document.createElement("caption");
    tableTitle.textContent = "Relative Gene Expression Results: " + title;
    tableTitle.id = "rge-table-title";
    table.appendChild(tableTitle);
    table.id = "rge-table";
    
    const headers = [
        "Sample Name",
        "Gene of Interest",
        "House Keeping Gene",
        "GOI Cts",
        "HKG Cts",
        "ΔCts",
        "2^-ΔCts",
        "Reference Sample",
        "ΔΔCts (2^-ΔCts/Reference Sample Average 2^-ΔCt)",
        "%KD"
    ]; 

    //Create table headers, adding an event listener to the appropriate headers
    const headerRow = document.createElement("tr");
    for(let header of headers){
        const th = document.createElement("th");
        th.textContent = header;
        if(header === "Gene of Interest" || header === "House Keeping Gene" || header === "Reference Sample"){
            
            if(header === "Gene of Interest"){
                const selectEle = createTargetSelect(targets);
                selectEle.id = "goi-select";
                selectEle.addEventListener("change", handleGoiChange);  
                th.appendChild(selectEle);
            } 
            else if (header === "House Keeping Gene"){
                const selectEle = createTargetSelect(targets);
                selectEle.id = "hkg-select";
                selectEle.addEventListener("change", handleHkgChange);
                th.appendChild(selectEle);
            } 
            else{
                const selectEle = createSampleSelect(samples);
                selectEle.id = "refsample-select-all";
                selectEle.addEventListener("change", handleReferenceSampleChangeAll);
                th.appendChild(selectEle);
            }
        }
        headerRow.appendChild(th);
    }

    tableHeaders.appendChild(headerRow);
    table.appendChild(tableHeaders);


    const selectRefSampleEle = createSelectRefSampleEle(samples);
    for(let sample of samples){
        const row = document.createElement("tr");
        row.className = "rge-sample";
        row.sample = sample;
        const sampleTableData = sample.getTableData();
        for(let j = 0; j < sampleTableData.length; j++){
            const header = headers[j];
            const td = document.createElement("td");
            if(header === "Reference Sample"){
                const selectEle = selectRefSampleEle.cloneNode(true);
                selectEle.className = "refsample-select";
                selectEle.id = `${sample.name}-${header}`;
                selectEle.addEventListener("change", handleReferenceSampleChange);
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
 * 
 * @param {classes.RtqpcrSample[]} samples 
 */
function createSampleSelect(samples){
    const selectEle = document.createElement("select");
    const noneOption = document.createElement("option");
    noneOption.value = "None";
    noneOption.text = "None";
    selectEle.appendChild(noneOption);
    for(let sample of samples){
        const optionEle = document.createElement("option");
        optionEle.value = sample.name;
        optionEle.text = sample.name;
        selectEle.appendChild(optionEle);
    }
    return selectEle;
}

/**
 * 
 * @param {string[]} targets 
 */
function createTargetSelect(targets){
    const selectEle = document.createElement("select");
    for(let target of targets){
        const optionEle = document.createElement("option");
        optionEle.value = target;
        optionEle.text = target;
        selectEle.appendChild(optionEle);
    }
    return selectEle;
}

/**
 * @param {Event} e
 */
function handleReferenceSampleChangeAll(e){
    const refsampleSelects = document.getElementsByClassName("refsample-select");
    for(let refsampleSelect of refsampleSelects) {
        refsampleSelect.value = e.target.value;
        refsampleSelect.dispatchEvent(new CustomEvent("change", {target:{value:e.target.value}}));
    };
}

/**
 * @param {Event} e
 */
function handleReferenceSampleChange(e){
    const userSelectedRefSample = e.target.value;
    /**
     * @type {classes.RtqpcrSample}
     */
    const sample = e.target.parentElement.parentElement.sample;
    if(userSelectedRefSample === "None" || sample.hkg === null || sample.goi === null) return;
    /**
     * @type {classes.RtqpcrSample}
     */
    const refSample = document.getElementById(userSelectedRefSample).sample;
    refSample.isRefSample = true;
    refSample.color = "#E7F0DC"
    refSample.refSampleCount++;

    //Remove a reference count to the previous reference sample if there was one
    const prevRefSample = sample.refSample;
    if(prevRefSample !== null){
        prevRefSample.refSampleCount--;
        if(prevRefSample.refSampleCount === 0){
            prevRefSample.color = "rgba(255, 105, 105, 1)";
            prevRefSample.isRefSample = false;
        }
    } 
    sample.refSample = refSample;

    //Calculate the relative gene expression values
    //"ΔΔCts (2^-ΔCts/Reference Sample Average 2^-ΔCt)", "%KD"
    sample.goi.deltadeltaCts = sample.goi.rges.map(rge => rge/refSample.goi.averageRge);
    sample.goi.percentKds = sample.goi.deltadeltaCts.map(deltadeltaCt => (1 - deltadeltaCt) * 100);
    document.getElementById(`${sample.name}-ΔΔCts (2^-ΔCts/Reference Sample Average 2^-ΔCt)`).textContent = sample.goi.deltadeltaCts.map(deltadeltaCt => deltadeltaCt.toFixed(2)).join(", ");
    document.getElementById(`${sample.name}-%KD`).textContent = sample.goi.percentKds.map(percentKd =>  percentKd.toFixed(2)).join(", ");
    // CHART.data.datasets[0].data = samples.map(sample=>sample.goi === null?0:sample.goi.rge);
    // CHART.data.datasets[0].backgroundColor = samples.map(sample => sample.color);
    // CHART.update();
}
/**
 * @param {classes.RtqpcrSample[]} samples
 * @param {string[]} targetNames
 * @param {string[]} targetColors
 * @param {string} title
 * @param {HTMLElement} container
 */
function createResultsTable(samples, targetNames, targetColors, title, container){
    const tableTitle = document.createElement("caption");
    tableTitle.textContent = "Results Summary: " + title;
    tableTitle.id = "results-summary-title";
    
    const table = document.createElement("table");
    table.id = "results";
    const tableBody = document.createElement("tbody");

    const tableHeaders = document.createElement("thead");

    const headerTitles = ["", ...targetNames];
    const subheaderTitles = ["Name", "Wells", "All Replicates", "Ave (Stdev)", "Best Replicates"];
    const targetHeaderWidth = 4;
    const headers = document.createElement("tr");
    for (let i = 0; i < headerTitles.length; i++){
        const th = document.createElement("th");
        th.textContent = headerTitles[i];
        th.className = "header targets"
        if(headerTitles[i] !== ""){
            th.colSpan = targetHeaderWidth
            th.style.backgroundColor = targetColors[i-1];
        };
        headers.appendChild(th);
    }

    const subHeaders = document.createElement("tr");
    for(let i = 0; i < targetNames.length; i++){
        for (let subheaderTitle of subheaderTitles){
            if( i > 0 && subheaderTitle === "Name") continue;
            const th = document.createElement("th");
            th.className = "subheader";
            th.textContent = subheaderTitle;
            subHeaders.appendChild(th);
        }
    }

    for (let sample of samples){
        const tr = document.createElement("tr");
        tr.className = "results-sample";
        tr.sample = sample;
        tr.id = sample.name;
        for (let data of sample.getResultsSummaryTableData(targetNames)){
            const td = document.createElement("td");
            td.textContent = data;
            tr.appendChild(td);
        }
        tableBody.appendChild(tr);
    }

    tableHeaders.appendChild(headers);
    tableHeaders.appendChild(subHeaders);

    table.appendChild(tableTitle);
    table.appendChild(tableHeaders);
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
 * @param {classes.RtqpcrSample[]} samples
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
            const target = sample.getTargetFromPosition(sample.wellPositions[i]);
            lws.set(sample.wells[i], 
                {
                    name:sample.name,
                    wellPosition:sample.wellPositions[i],
                    wellNumber:sample.wells[i],
                    targetName:target.name,
                    color:target.color,
                });
        }
    }
    return Array.from(lws.values());
}

/**
 * @param {string[]} targets
 * @param {string} id - The id of the select element to update
 */
function updateSelectUiWithGenes(targets, id){
    const selectEleTargets = document.getElementById(id);
    selectEleTargets.innerHTML = "";
    const noneOptionEle = document.createElement("option");
    noneOptionEle.textContent = "None";
    selectEleTargets.appendChild(noneOptionEle);
    for(let target of targets){
        const optionEle = document.createElement("option");
        optionEle.text = target;
        selectEleTargets.appendChild(optionEle);
    }
}

/**
 * @param {classes.RtqpcrSample[]} samples
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
function handleHkgChange(e){
    const hkgName = e.target.value;
    if(hkgName === "None") return;

    //Get the name of the gene of interest to be able to filter for samples that only contain both targets
    const goiName = document.getElementById("goi-select").value;
    //All tr elements should have the class name "samples" 
    //and should have a property that references the sample object they represent in the table
    const sampleEles = document.getElementsByClassName("rge-sample");
    
    //Calculate the ΔCt value for each non-reference gene of each sample
    //If a sample in a row does not have the gene of interest, set the display of the row to "none" to hide it from the UI
    for(let sampleEle of sampleEles){
        /**
         * @type {classes.RtqpcrSample}
         */
        const sample = sampleEle.sample;
        if(!sample.targets.has(hkgName) && goiName === "None"){
            sampleEle.classList.add("hidden");
            continue;
        }
        else if(!sample.targets.has(hkgName) || (goiName !== "None" && !sample.targets.has(goiName))){
            sampleEle.classList.add("hidden");
            continue;
        }

        if(sampleEle.classList.contains("hidden")){
            sampleEle.classList.remove("hidden");
        }
        const hkg = sample.targets.get(hkgName);
        sample.hkg = hkg;
        if(goiName !== "None"){
            sample.goi = sample.targets.get(goiName);
            sample.goi.deltaCts = sample.goi.cqs.map( (cq, i, arr) => cq - sample.hkg.cqs[i]);
            sample.goi.rges = sample.goi.deltaCts.map(deltaCt => 2**(-deltaCt));
            sample.goi.averageRge = ss.mean(sample.goi.rges);
            document.getElementById(`${sample.name}-Gene of Interest`).textContent = goiName;
            document.getElementById(`${sample.name}-GOI Cts`).textContent = sample.goi.cqs.map(cq => cq.toFixed(2)).join(", ");
            document.getElementById(`${sample.name}-ΔCts`).textContent = sample.goi.deltaCts.map(deltaCt => deltaCt.toFixed(2)).join(", ");
            document.getElementById(`${sample.name}-2^-ΔCts`).textContent = sample.goi.rges.map(rge => rge.toFixed(2)).join(", ");
            const refSampleSelectEle = document.getElementById(`${sample.name}-Reference Sample`);
            refSampleSelectEle.dispatchEvent(new CustomEvent("change", {target:{value:refSampleSelectEle.value}}));
        } 
        document.getElementById(`${sample.name}-House Keeping Gene`).textContent = hkg.name;
        document.getElementById(`${sample.name}-HKG Cts`).textContent = sample.hkg.cqs.map(cq => cq.toFixed(2)).join(", ");

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

    //Get the name of the house keeping gene to be able to filter for samples that only contain both targets
    const hkgName = document.getElementById("hkg-select").value;

    //All tr elements should have the class name "samples" 
    //and should have a property that references the sample object they represent in the table
    const sampleEles = document.getElementsByClassName("rge-sample");

    //Calculate the ΔCt value for each non-reference gene of each sample
    //If a sample in a row does not have the gene of interest, set the display of the row to "none" to hide it from the UI
    for(let sampleEle of sampleEles){
        /**
         * @type {classes.RtqpcrSample}
         */
        const sample = sampleEle.sample;
        if(!sample.targets.has(goiName) && hkgName === "None"){
            sampleEle.classList.add("hidden");
            continue;
        }
        else if(!sample.targets.has(goiName) || (hkgName !== "None" && !sample.targets.has(hkgName))){
            sampleEle.classList.add("hidden");
            continue;
        }

        if(sampleEle.classList.contains("hidden")){
            sampleEle.classList.remove("hidden");
        }
        const goi = sample.targets.get(goiName);
        sample.goi = goi;
        if(hkgName !== "None"){
            sample.hkg = sample.targets.get(hkgName);
            sample.goi.deltaCts = sample.goi.cqs.map( (cq, i, arr) => cq - sample.hkg.cqs[i]);
            sample.goi.rges = sample.goi.deltaCts.map(deltaCt => 2**(-deltaCt));
            sample.goi.averageRge = ss.mean(sample.goi.rges);
            document.getElementById(`${sample.name}-House Keeping Gene`).textContent = hkgName;
            document.getElementById(`${sample.name}-HKG Cts`).textContent = sample.hkg.cqs.map(cq => cq.toFixed(2)).join(", ");
            document.getElementById(`${sample.name}-ΔCts`).textContent = sample.goi.deltaCts.map(deltaCt => deltaCt.toFixed(2)).join(", ");
            document.getElementById(`${sample.name}-2^-ΔCts`).textContent = sample.goi.rges.map(rge => rge.toFixed(2)).join(", ");
            const refSampleSelectEle = document.getElementById(`${sample.name}-Reference Sample`);
            refSampleSelectEle.dispatchEvent(new CustomEvent("change", {target:{value:refSampleSelectEle.value}}));
        } 
        
        document.getElementById(`${sample.name}-Gene of Interest`).textContent = goi.name;
        document.getElementById(`${sample.name}-GOI Cts`).textContent = sample.goi.cqs.map(cq => cq.toFixed(2)).join(", ");
        
    }
}

/**
 * @param {classes.RtqpcrSample[]} samples
 * @return {null}
 */
function updateSampleAverageStdev(samples){
    //Mutates the sample objects in the sample map by updating the average, stdev, bestDuplicates properties of the Target object property of the Sample
    for(let sample of samples){
        for(let target of sample.targets.values()){
            target.bestDuplicates = getBestDuplicates(target.cqs);
            target.bestAverage = ss.mean(target.bestDuplicates);
            target.average = ss.mean(target.cqs);
            if(target.cqs.length > 1) target.bestStdev = ss.sampleStandardDeviation(target.bestDuplicates);
            if(target.cqs.length > 1) target.stdev = ss.sampleStandardDeviation(target.cqs);
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
 * @param {string[][]} rawdata
 * @returns {Map<string, classes.RtqpcrSample[]|string[]}
 */
function createSamplesAndTargets(rawdata){
    const importantHeaders = ["Sample", "Target", "Well", "Well Position", "Reporter", "Cq"];
    const minLength = 20;
    /**
     * @type {Map<string, classes.RtqpcrSample>}
     */
    const samples = new Map();
    const targets = new Map();
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
            const [sampleName, targetName, wellNumber, wellPosition, reporter, cq] = sampleData;
            let color = helpers.getRandomColor(0.3);
            if(!samples.has(sampleName)){
                if(targets.has(targetName)) color = targets.get(targetName);
                else targets.set(targetName, color)
                const target = classes.createTarget(targetName, reporter, cq, wellNumber, wellPosition, color);
                const sample = classes.createRtqpcrSample(sampleName, target, wellNumber, wellPosition);
                samples.set(sample.name, sample);
            }
            else{
                const sample = samples.get(sampleName);
                if(!sample.targets.has(targetName)){
                    if(targets.has(targetName)) color = targets.get(targetName);
                    else targets.set(targetName, color)
                    const target = classes.createTarget(targetName, reporter, cq, wellNumber, wellPosition, color);
                    targets.has(target.name)?"":targets.set(target.name, target.name)
                    sample.targets.set(target.name, target);                    
                    sample.wells.push(wellNumber);
                    sample.wellPositions.push(wellPosition);
                }
                else{
                    sample.targets.get(targetName).cqs.push(cq);
                    sample.targets.get(targetName).wells.push(wellNumber);
                    sample.targets.get(targetName).wellPositions.push(wellPosition);
                    sample.wells.push(wellNumber);
                    sample.wellPositions.push(wellPosition);
                }
            }
        }
    }
    return new Map([
        ["samples", Array.from(samples.values())],
        ["targets", Array.from(targets.keys())],
        ["colors", Array.from(targets.values())],
    ]);
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
        if(sample.name.toUpperCase()!=="NONE") circularDiv.style.backgroundColor = sample.color;
        parent.appendChild(circularDiv);
    }
}

main()