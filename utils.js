const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

//function to get current solana price
const getSolPrice = async () => {
    const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await response.json();
    return data.solana?.usd;
};

const checkDexPaid = async (tokenAddress) => {
    try {
        const response = await fetch(`https://www.checkdex.xyz/api/dexscreener?tokenAddress=${tokenAddress}`);
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        if (data.pairs && data.pairs.length > 0) return true;
        return false;
    } catch (e) {
        console.error("Error fetching dex paid status:", e);
        return false;
    }
}

const getLatestBoostedTokens = async () => {
    try {
        const response = await fetch(`https://api.dexscreener.com/token-boosts/latest/v1`)
        if (!response.ok) {
            return [];
        }
        const data = await response.json();
        return data.map(token => token.tokenAddress);
    } catch (e) {
        console.error("Error fetching boosted tokens:", e);
        return [];
    }
}

// Function to fetch ticker information
const getTokenInfo = async (mint) => {
    try {
        const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching ticker info:", error);
        return null;
    }
};

module.exports = {
    sleep,
    checkDexPaid,
    getLatestBoostedTokens,
    getSolPrice,
    getTokenInfo,
}