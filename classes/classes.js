/**
 * @typedef {Object} Sample
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
 * @param {string} name 
 * @param {string} type 
 * @param {string} unit 
 * @param {string[]} wellPositions 
 * @param {number[]} wellNumbers 
 * @param {number} x 
 * @param {number[]} ys 
 * @returns {Sample}
 */
function createSample(name, type, unit, wellPositions, wellNumbers, x, ys){
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

module.exports = {
    createSample,
}