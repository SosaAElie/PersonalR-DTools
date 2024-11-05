/**
 * @typedef {Object} RegressionSample
 * @property {string} name - The name of the sample
 * @property {string} type - The type of the sample i.e standard, sample, control.
 * @property {number[]} ys - The OD(s)
 * @property {number} averageY - The average of y if sample was loaded in replicates 
 * @property {number} stdev - The standard deviation of y if sample was loaded in replicates 
 * @property {number} x - The concentration if the sample is of type standard
 * @property {string} unit - The units of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {string[]} wellPositions - The wells the sample was loaded in i.e A1, B1, C1, etc.
 * @property {number[]} wellNumbers - The well numbers the sample was loaded in i.e 1 2,3,4, etc.
 * @property {number} interpolatedX - The interpolated concentration obtained from the regression model
 * @property {number} undilutedX - The interpolated concentration times the dilution factor
 * @property {number} convertedX - The undiluted concentration converted to the target unit
 * @property {number} dilutionFactor - The dilution factor used to dilute the unknown, i.e 25 for 1:25, 10 for 1:10, etc.
 * @property {string} targetUnit - The units to convert to of x i.e ug/mL, ng/mL, ug/uL, etc.
 * @property {SdsPageValues} sdspageValues - properties associated with loading the sample into an SDS-PAGE
 * @property {Function} getTableData - returns a list of data to display in an html table
 * @property {Function} getExcelData - returns a list of data to write to excel
 * 
*/

/**
 * @typedef SdsPageValues
 * @property {number} proteinPerWell - The total protein in the target unit to load into a well for SDS-PAGE
 * @property {number} volPerWell - The total desired volume to load into a protein gel well
 * @property {number} proteinVolPerWell - The stock protein volume required per well
 * @property {number} laemmliVolPerWell - The volume of 4x laemmli required per well
 * @property {number} bufferVolPerWell - The volume of buffer (i.e H2O) required to reach total volume per well
 * @property {number} replicates - The number of times this sample will be loaded into an SDS-PAGE
 * @property {number} replicateVol - The volPerWell times the replicates
 * @property {number} replicateProteinVol - The proteinVolPerWell times the replicates
 * @property {number} replicateLaemmliVol - The laemmliVolPerWell times the replicates
 * @property {number} replicateBufferVol - The bufferVolPerWell times the replicates
 * @property {function} getGelData - returns a list containing all the properties of the object instance
 */

/**
 * @typedef {Object} RtqpcrSample
 * @property {string} name - Sample name
 * @property {Map<string, Target>} targets - The target genes
 * @property {number[]} wells - The well numbers the sample was loaded in i.e 1,2,3...384
 * @property {string[]} wellPositions - The well positions the sample was loaded in i.e A1, B1, C1, etc.
 * @property {Target|null} hkg - House Keeping Gene
 * @property {Target|null} goi - Gene of Interest
 * @property {boolean} isRefSample - returns true if this sample is selected to the be the reference sample
 * @property {number} refSampleCount - The number of samples that this sample is a reference sample for
 * @property {Function} getTableData - returns an array containing data to display on a table
 * @property {Function} getResultsSummaryTableData - returns an array containing data to display on a table
 * @property {Function} getTargetFromPosition - returns target based off the well position passed in
 * @property {Sample} refSample - The reference sample that is used to calculate the ΔΔCt for this sample
 * @property {string} color - The color that the bar in the bar graph will be to represent this sample
*/

/**
 * @typedef {Object} Target
 * @property {string} name - Target gene name
 * @property {string} color - Target gene color
 * @property {string[]} wells - The well numbers the target was selected for i.e 1,2,3...384
 * @property {string[]} wellPositions - The wells that this target is associated with, i.e A1, B2, etc.
 * @property {string} reporter - The associated fluorescent reporter
 * @property {number[]} cqs - The associated Ct/Cq values
 * @property {number[]} bestDuplicates - The best duplicates out of the total replicates in a run
 * @property {number} average - The average of all cqs
 * @property {number} bestAverage - The average of the best duplicates
 * @property {number} stdev - The sample standard deviation of all cqs
 * @property {number} bestStdev - The sample standard deviation of the best duplicate
 * @property {number[]} deltaCts - ct (gene of interest) - ct (housekeeping gene)
 * @property {number[]} deltadeltaCts - ΔCt (unknown sample or target sample) - ΔCt (reference sample or control sample)
 * @property {number} rge - Relative Gene Expression, 2^-ΔΔCt
 * @property {number} percentKd - The amount of knockdown relative to the reference sample expressed as a percentage
 * @property {number} pcrEfficiency - The PCR efficiency of the target gene, default is 1
 * @property {Function} getResultsTableData - Returns a list of values that relate to the target to display in an HTML table
 */


/**
 * @param {string} name 
 * @param {string} type 
 * @param {string} unit 
 * @param {string[]} wellPositions 
 * @param {number[]} wellNumbers 
 * @param {number} x 
 * @param {number[]} ys 
 * @returns {RegressionSample}
 */
function createRegressionSample(name, type, unit, wellPositions, wellNumbers, x, ys){
    /**
     * @returns {string[]} 
     */
    function getTableData(){
        return [
            this.name, this.type, this.wellPositions.join(", "), this.ys.map(y => y.toFixed(2)).join(", "), this.averageY.toFixed(2), this.stdev.toFixed(2), 
            this.interpolatedX.toFixed(2), this.undilutedX.toFixed(2), this.convertedX.toFixed(2)
        ];
    }

    /**
     * @returns {string[]}
     */
    function getExcelData(){
        return [
            this.name, this.type, this.ys.map(y => y.toFixed(2)).join(","), `${this.averageY.toFixed(2)} (${this.stdev.toFixed(2)})`, 
            this.interpolatedX.toFixed(2), this.undilutedX.toFixed(2), this.convertedX.toFixed(2), ...this.sdspageValues.getGelData()
        ]
    }


    return {name, type, unit, wellPositions, wellNumbers, x, ys, sdspageValues:createSdsPageValues(), getTableData, getExcelData};
}

/**
 * @returns {SdsPageValues}
 */
function createSdsPageValues(){
    /**
     * @returns {string[]}
     */
    function getGelData(){
        return Array.from(Object.values(this)).filter((val, i, arr) => typeof val === "number").map(prop => prop.toFixed(2));
    }

    return{
        proteinPerWell:NaN,
        volPerWell:NaN,
        proteinVolPerWell:NaN,
        laemmliVolPerWell:NaN,
        bufferVolPerWell:NaN,
        replicates:1,
        replicateVol:NaN,
        replicateProteinVol:NaN,
        replicateLaemmliVol:NaN,
        replicateBufferVol:NaN,
        getGelData,
    }
}

/**
 * @param {string} name
 * @param {Target} target
 * @param {number} well
 * @param {string} wellPosition
 * @return {RtqpcrSample}
 */
function createRtqpcrSample(name, target, well, wellPosition){
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
         * @param {string} wellPos
         * @returns {Target|null}
         */
        getTargetFromPosition(wellPos){
            for(let target of this.targets.values()){
                if(target.wellPositions.includes(wellPos)) return target;
            }
            return null;
        },
        /**
         * 
         * @param {string} targetName 
         * @returns {string[]|number[]}
         */
        getTableData(targetName = null){
            const numOfCols = 9
            return (
                targetName === null?
                [this.name, ...new Array(numOfCols).fill("")]
                :
                [this.name, this.targets.get(targetName).name, this.hkg.name, this.targets.get(targetName).average, this.hkg.average, this.targets.get(targetName).deltaCt,this.refSample.name, this.targets.get(targetName).deltadeltaCt, this.targets.get(target).rge]
            
            )
        },
        /**
         * @param {string[]} targetNames
         * @returns {string[]}
         */
        getResultsSummaryTableData(targetNames){
            const valuesPerTarget = 4;
            const data = [];
            for(let targetName of targetNames){
                if(this.targets.has(targetName)){
                    data.push(...this.targets.get(targetName).getResultsTableData());
                }
                else{
                    data.push(...new Array(valuesPerTarget).fill(""));
                }
            }
            return [
                this.name,
                ...data,
            ]
        }
    }
}

/**
 * @param {string} name
 * @param {string} reporter
 * @param {number} cq
 * @param {number} wellNum
 * @param {string} wellPos
 * @param {string} color
 * @return {Target}
 */
function createTarget(name, reporter, cq, wellNum, wellPos, color){
    return{
        name,
        wells:[wellNum],
        wellPositions:[wellPos],
        reporter,
        cqs:[cq],
        bestDuplicates:[],
        average:NaN,
        bestAverage:NaN,
        stdev:NaN,
        deltaCt:NaN,
        deltadeltaCt:NaN,
        rge:NaN,
        color:color,
        pcrEfficiency:1,
        getResultsTableData(){
            return [
                this.wellPositions.join(", "),
                this.cqs.map(cq => cq.toFixed(2)).join(", "),
                `${this.average.toFixed(2)} (${this.stdev.toFixed(2)})`,
                this.bestDuplicates.map(duplicate => duplicate.toFixed(2)).join(", "),
            ];
        }
    }
}

module.exports = {
    createRegressionSample,
    createRtqpcrSample,
    createTarget,
}