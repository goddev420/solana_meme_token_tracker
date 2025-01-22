// Function to calculate the age of the token using creation date
function calculateAge(creationDate) {
    const currentDate = new Date();
    const creationDateObj = new Date(creationDate * 1000);
    const ageInMilliseconds = currentDate - creationDateObj;

    const years = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24 * 365));
    const days = Math.floor(
        (ageInMilliseconds % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24)
    );
    const hours = Math.floor(
        (ageInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor(
        (ageInMilliseconds % (1000 * 60 * 60)) / (1000 * 60)
    );
    const seconds = Math.floor((ageInMilliseconds % (1000 * 60)) / 1000);

    let ageString = "";
    if (years > 0) ageString += `${years} years, `;
    if (days > 0) ageString += `${days} days, `;
    if (hours > 0) ageString += `${hours} hours, `;
    if (minutes > 0) ageString += `${minutes} minutes, `;
    if (seconds > 0) ageString += `${seconds} seconds`;

    // Remove trailing comma and space if they exist
    ageString = ageString.trim().replace(/,$/, "");

    return ageString;
}

function calculateSecond(creationDate) {
    const currentDate = new Date();
    const creationDateObj = new Date(creationDate * 1000);
    const ageInMilliseconds = currentDate - creationDateObj;

    return Math.floor(ageInMilliseconds/1000);
}

// Function to format market cap
function formatMarketCap(marketCap) {
    if (marketCap >= 1000) {
        return (marketCap / 1000).toFixed(0) + "K";
    }
    return marketCap.toString();
}

//function to calculate bonding curve progress
function calculateBondingCurveProgress(balance) {
    // Logic to calculate bonding curve progress
    const bondingCurveProgress = 100 - ((balance - 206900000) * 100) / 793100000;
    return bondingCurveProgress;
}

//function to calculate top 10 holder percentage
function calculateTop10HolderPercentage(largestAccounts) {
    // Logic to calculate top 10 holder percentage
    let top10Holder = 0;

    for (
        let i = 1;
        i < (largestAccounts.value.length > 11 ? 11 : largestAccounts.value.length);
        i++
    ) {
        top10Holder += largestAccounts.value[i].uiAmount;
    }
    // console.log('top10Holder', top10Holder);
    return Math.floor((top10Holder * 100) / 1000000000);
}
// function to calculate top 20 holder percentage
function calculateTop20HolderPercentage(largestAccounts) {
    // Logic to calculate top 10 holder percentage
    let top20Holder = 0;

    for (
        let i = 1;
        i < (largestAccounts.value.length > 20 ? 20 : largestAccounts.value.length);
        i++
    ) {
        top20Holder += largestAccounts.value[i].uiAmount;
    }
    // console.log('top20Holder', top20Holder);
    return Math.floor((top20Holder * 100) / 1000000000);
}
module.exports = {
    calculateAge,
    formatMarketCap,
    calculateBondingCurveProgress,
    calculateTop10HolderPercentage,
    calculateTop20HolderPercentage,
    calculateSecond
}