/**
 * @param {string} sampleName
 * @returns {Map<string,string>}
 */
function parseSampleName(sampleName){
    //Returns a map of size 2 or 4 if the sample name is determined to be a "sample" or "standard" respectively

    //Splits the string into 2 substrings, based on the index of the first "-" character
    const parsed = new Map([
        ["type", "none"],
        ["name", "none"]
    ]);
    const splittingIndex = sampleName.indexOf("-");
    if (splittingIndex <= -1) return parsed;

    const type = sampleName.substring(0, splittingIndex).toLowerCase();
    const name = sampleName.substring(splittingIndex+1);
    parsed.set("type", type)
    parsed.set("name", name);

    if (type === "standard"){
        //Assumes the unit consists of at 5 characters, i.e "mg/mL" 
        const unit = name.slice(-5);
        const x = parseFloat(name.slice(0,-5));
        parsed.set("unit", unit);
        parsed.set("x", x);
    }

    return parsed;
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





module.exports = {
    parseSampleName,
    convertConcentration,
}