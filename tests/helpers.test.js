const helpers = require("../utils/helpers.js");
const {test, expect} = require("@jest/globals")

test("Returns a map with 2 keys and 2 values, all are strings", ()=>{
    const unparsed = [
        "Sample-Test1",
        "Sample-",
        "Sample-Test3-",
        "Sample-Test4-5",
        "none",
        "Standard-1000ug/mL",
    ]
    
    const results = [
        "Test1",
        "",
        "Test3-",
        "Test4-5",
        "none",
        "1000ug/mL",
    ]
    for (let i = 0; i < unparsed.length; i++){
        const unparsedName = unparsed[i];
        const expectedName = results[i];
        const res = helpers.parseSampleName(unparsedName);
        expect(res.get("name")).toBe(expectedName);
    }
})