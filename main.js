const { sendTgMsgToUsers, loadUsersFromFile } = require("./bot");
const {
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
  Keypair,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { sleep, getSolPrice, getTokenInfo } = require("./utils");
const { PumpFunSDK } = require("pumpdotfun-sdk");
const { AnchorProvider } = require("@coral-xyz/anchor");
const nodewallet = require("@coral-xyz/anchor/dist/cjs/nodewallet");
require("dotenv").config();
const { Deque } = require("./types");
const { checkDexPaid, getLatestBoostedTokens } = require("./utils");
const { AppDataSource } = require("./data-source");
const { Token } = require("./entities/Token");
const base58 = require("bs58").default;
const {
  formatMarketCap,
  calculateAge,
  calculateBondingCurveProgress,
  calculateTop10HolderPercentage,
  calculateTop20HolderPercentage,
  calculateSecond
} = require("./formats");
const { LIQUIDITY_STATE_LAYOUT_V4, WSOL, METADATA_PROGRAM_ID } = require("@raydium-io/raydium-sdk");
const { Mint } = require("./entities/Mint");
const { connect } = require("mongoose");

//import dotenv
const RPC_HTTPS_URL = process.env.RPC_HTTPS_URL ?? "";
// const RPC_WSS_URL = process.env.RPC_WSS_URL ?? "";

// constants
const pumpfunManage = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const pumpfunMintAuthority = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";
const pumpfunFeeRecipient = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM";
const raydiumAmm = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const initialMarketCaps = [45000, 30000];
let solPrice = 240;

const connection = new Connection(RPC_HTTPS_URL, {
  // wsEndpoint: RPC_WSS_URL,
  commitment: "confirmed",
});
const wallet = new nodewallet.default(new Keypair());
const anchorProvider = new AnchorProvider(connection, wallet, {
  commitment: connection.commitment,
});
const sdk = new PumpFunSDK(anchorProvider);
const tokenRepository = AppDataSource.getRepository(Token);
const mintRepository = AppDataSource.getRepository(Mint);

const updateSolPrice = async () => {
  console.log("Updating sol price...");
  while (true) {
    solPrice = (await getSolPrice()) || solPrice;
    await sleep(1000);
  }
};

//function to get spl token balance on bonding curve
const getSPLTokenBalance = async (address) => {
  try {
    const balance = await connection.getTokenAccountBalance(
      new PublicKey(address)
    );
    // Logic to get SPL token balance
    return Math.floor(balance.value.uiAmount || 0);
  } catch {
    return 0;
  }
};

const getHolders2 = async (mint) => {
  try {
    const accounts = await connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID,
      {
        commitment: connection.commitment,
        filters: [
          {
            dataSize: 165,
          },
          {
            memcmp: {
              offset: 0,
              bytes: mint,
            },
          },
        ],
      }
    );
    const whales = await Promise.all(
      accounts.map(async (account) => {
        const balance = await connection.getBalance(account.account.owner, {
          commitment: connection.commitment,
        });
        return balance > 100 * LAMPORTS_PER_SOL;
      })
    );
    return [accounts.length, whales.filter(Boolean).length];
  } catch (e) {
    console.error("Error fetching token accounts:", e);
    return [0, 0];
  }
};

const pendingTokens = new Deque();

const getPumpMint0 = async (signature, isMint, isTransfer) => {
  let mintPK = undefined;
  let bondingCurvePK = undefined;
  let associatedBondingCurvePK = undefined;
  try {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    // in case of specific swap through third party - "infwiWUCBtdDG61p285W5uaxC3VpvwP3Ww1KEbkLSx9"
    const innerInsts = tx?.meta?.innerInstructions;
    if (innerInsts) {
      for (const innerIxn of innerInsts.reverse()) {
        const tinyInsts = innerIxn.instructions;
        for (const ixn of tinyInsts.reverse()) {
          if (ixn.programId.toBase58() == pumpfunManage) {
            const accountsList = ixn.accounts;
            if (isTransfer) {
              if (
                accountsList.length > 11 &&
                accountsList[0].toBase58() ===
                "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
              ) {
                mintPK = accountsList[2];
                bondingCurvePK = accountsList[3];
                associatedBondingCurvePK = accountsList[4];
                break;
              }
            } else if (isMint) {
              if (
                accountsList.length > 11 &&
                accountsList[4].toBase58() ===
                "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
              ) {
                mintPK = accountsList[0];
                bondingCurvePK = accountsList[2];
                associatedBondingCurvePK = accountsList[3];
                break;
              }
            } else {
              return;
            }
          }
        }
        if (mintPK) {
          break;
        }
      }
    }

    if (!mintPK) {
      return;
    }

    const bondingCurve = await sdk.getBondingCurveAccount(
      mintPK,
      connection.commitment
    );
    if (!bondingCurve) return;
    const marketCap =
      (solPrice * Number(bondingCurve.getMarketCapSOL())) / LAMPORTS_PER_SOL;

    pendingTokens.append({
      mintAddress: mintPK.toBase58(),
      bondingCurveAddress: bondingCurvePK.toBase58(),
      associatedBondingCurveAddress: associatedBondingCurvePK.toBase58(),
      marketCap,
      isMint,
      isTransfer,
    });
    // console.log(`${mintPK.toBase58()} (${isMint}): ${pendingTokens.size()}`);
    return;
  } catch (e) {
    console.error("Error:", e);
  }
};

const getPumpMint = async (signature, isMint, isTransfer) => {
  let mintPK = undefined;
  let bondingCurvePK = undefined;
  let associatedBondingCurvePK = undefined;
  try {
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    let instruction = tx?.transaction.message.instructions
      .reverse()
      .find((ixn) => ixn.programId.toBase58() == pumpfunManage);
    if (!instruction) {
      instruction = tx?.meta?.innerInstructions
        .slice() // Create a shallow copy to avoid mutating the original array
        .reverse()
        .flatMap((innerIxn) => innerIxn.instructions)
        .find(
          (innerInst) =>
            innerInst.programId.toBase58() === pumpfunManage &&
            innerInst.accounts.length > 11
        );
    }
    if (!instruction) {
      return;
    }
    const { accounts } = instruction;
    if (accounts?.length > 11) {
      switch (accounts?.at(1)?.toBase58()) {
        case pumpfunFeeRecipient:
          mintPK = accounts[2];
          bondingCurvePK = accounts[3];
          associatedBondingCurvePK = accounts[4];
          break;
        case pumpfunMintAuthority:
          mintPK = accounts[0];
          bondingCurvePK = accounts[2];
          associatedBondingCurvePK = accounts[3];
          break;
        default:
          break;
      }
    }

    if (!mintPK) {
      return;
    }

    const bondingCurve = await sdk.getBondingCurveAccount(
      mintPK,
      connection.commitment
    );
    if (!bondingCurve) return;
    const marketCap =
      (solPrice * Number(bondingCurve.getMarketCapSOL())) / LAMPORTS_PER_SOL;

    let slot = tx.slot;
    let created_timestamp = tx.blockTime;
    let creator = tx.transaction.message.accountKeys.find(key => key.signer == true && key.pubkey.toBase58() != mintPK.toBase58())
    try {
      isMint ?
        await mintRepository
          .insert({ mint: mintPK.toBase58(), slot: slot, snipers: isTransfer ? 1 : 0 })
        // .then(() => console.log(`Mint inserted: ${mintPK.toBase58()}`))
        // .catch((err) => console.error(`Mint insertion error: ${err}`))
        :
        await mintRepository
          .query(`UPDATE mints SET snipers = snipers + 1 WHERE mint = $1 AND slot = $2`, [mintPK.toBase58(), slot])
      // .then(() => console.log(`Mint updated snipers: ${mintPK.toBase58()}`))
      // .catch((err) => console.error(`Mint update snipers error: ${err}`));
    } catch (e) {
      console.error("Error:", e);
    }

    pendingTokens.append({
      mintAddress: mintPK.toBase58(),
      bondingCurveAddress: bondingCurvePK.toBase58(),
      associatedBondingCurveAddress: associatedBondingCurvePK.toBase58(),
      marketCap,
      isMint,
      creator: creator.pubkey.toBase58(),
      created_timestamp: created_timestamp ? created_timestamp * 1000 : Date.now(),
      isTransfer,
      slot,
    });
    // console.log(`${mintPK.toBase58()} (${isMint}): ${pendingTokens.size()}`);
    return;
  } catch (e) {
    console.error("Error:", e);
  }
};

const getAmmMarketCap = async (
  wsolVault,
  tokenVault,
  totalSupply = 1000000000
) => {
  try {
    const wsolAmount = await connection.getTokenAccountBalance(
      wsolVault,
      connection.commitment
    );
    const tokenAmount = await connection.getTokenAccountBalance(
      tokenVault,
      connection.commitment
    );
    if (wsolAmount.value.uiAmount && tokenAmount.value.uiAmount) {
      return (
        (solPrice * wsolAmount.value.uiAmount * totalSupply) /
        tokenAmount.value.uiAmount
      );
    } else {
      return 0;
    }
  } catch {
    return 0;
  }
};

const getRaydiumAmmKeys = async (pairPK) => {
  try {
    const accountInfo = await connection.getAccountInfo(pairPK, {
      commitment: connection.commitment,
    });
    if (!accountInfo) return null;
    const poolKeys = LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.data);
    if (
      poolKeys.baseMint.toBase58() == "11111111111111111111111111111111" ||
      poolKeys.quoteMint.toBase58() == "11111111111111111111111111111111"
    ) {
      return null;
    }
    return poolKeys;
  } catch (error) {
    return null;
  }
};

const getMintInfo = async (mintPK) => {
  const metadataPK = PublicKey.findProgramAddressSync([new TextEncoder().encode('metadata'), METADATA_PROGRAM_ID.toBytes(), mintPK.toBytes()], METADATA_PROGRAM_ID)[0]
  const metadataAccount = await connection.getAccountInfo(metadataPK, connection.commitment);
  const data = metadataAccount?.data;
  if (!data) {
    return null;
  }
  function unpackMetadataAccount(data) {
    const assert = (condition, message) => {
      if (!condition) {
        throw new Error(message);
      }
    };

    assert(data[0] === 4, 'Invalid data format');

    let i = 1;
    const sourceAccount = base58.encode(data.slice(i, i + 32)).toString();
    i += 32;

    const mintAccount = base58.encode(data.slice(i, i + 32)).toString();
    i += 32;

    const nameLen = data.readUInt32LE(i);
    i += 4;
    const name = data.slice(i, i + nameLen).toString('utf-8').replace(/\0/g, '');
    i += nameLen;

    const symbolLen = data.readUInt32LE(i);
    i += 4;
    const symbol = data.slice(i, i + symbolLen).toString('utf-8').replace(/\0/g, '');
    i += symbolLen;

    const uriLen = data.readUInt32LE(i);
    i += 4;
    const uri = data.slice(i, i + uriLen).toString('utf-8').replace(/\0/g, '');
    i += uriLen;

    const fee = data.readInt16LE(i);
    i += 2;

    const hasCreator = data[i] === 1;
    i += 1;

    const creators = [];
    const verified = [];
    const share = [];

    if (hasCreator) {
      const creatorLen = data.readUInt32LE(i);
      i += 4;

      for (let _ = 0; _ < creatorLen; _++) {
        const creator = base58.encode(data.slice(i, i + 32)).toString();
        creators.push(creator);
        i += 32;

        verified.push(data[i]);
        i += 1;

        share.push(data[i]);
        i += 1;
      }
    }

    const primarySaleHappened = data[i] === 1;
    i += 1;

    const isMutable = data[i] === 1;

    const metadata = {
      updateAuthority: sourceAccount,
      mint: mintAccount,
      data: {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: fee,
        creators,
        verified,
        share,
      },
      primarySaleHappened: primarySaleHappened,
      isMutable: isMutable,
    };

    return metadata;
  }
  const metadata = unpackMetadataAccount(data);
  const uriResponse = metadata.data.uri && (await fetch(metadata.data.uri));
  const uriData = uriResponse && (await uriResponse.json());
  return {
    name: metadata.data.name,
    symbol: metadata.data.symbol,
    twitter: uriData?.twitter,
    telegram: uriData?.telegram,
    website: uriData?.website,
  }
}

const getRaydiumAmmKeysWithData = async (data) => {
  try {
    const poolKeys = LIQUIDITY_STATE_LAYOUT_V4.decode(data);
    if (
      poolKeys.baseMint.toBase58() == "11111111111111111111111111111111" ||
      poolKeys.quoteMint.toBase58() == "11111111111111111111111111111111"
    ) {
      return null;
    }
    return poolKeys;
  } catch (error) {
    return null;
  }
};

// const getRaydiumMint = async (signature) => {
//   let mintPK = undefined;
//   let pairPK = undefined;
//   let tokenVault = undefined;
//   let wsolVault = undefined;
//   try {
//     const tx = await connection.getParsedTransaction(signature, {
//       commitment: "confirmed",
//       maxSupportedTransactionVersion: 0,
//     });
//     const instruction = tx?.transaction.message.instructions.find(
//       (ixn) => ixn.programId.toBase58() == raydiumAmm
//     );
//     if (instruction) {
//       const { accounts } = instruction;
//       if (accounts?.length > 11) {
//         pairPK = accounts[1];
//         const poolKeys = await getRaydiumAmmKeys(pairPK);
//         if (poolKeys) {
//           if (poolKeys.baseMint.toBase58() == WSOL.mint) {
//             mintPK = poolKeys.quoteMint;
//             wsolVault = poolKeys.baseVault;
//             tokenVault = poolKeys.quoteVault;
//           } else {
//             mintPK = poolKeys.baseMint;
//             wsolVault = poolKeys.quoteVault;
//             tokenVault = poolKeys.baseVault;
//           }
//         }
//       }
//     }
//     if (!mintPK) {
//       const instruction = tx?.meta.innerInstructions
//         .find((ixn) =>
//           ixn.instructions.some(
//             (instruction) => instruction.programId.toBase58() === raydiumAmm
//           )
//         )
//         ?.instructions.find(
//           (instruction) => instruction.programId.toBase58() === raydiumAmm
//         );

//       if (instruction) {
//         const { accounts } = instruction;
//         if (accounts?.length > 11) {
//           pairPK = accounts[1];
//           const poolKeys = await getRaydiumAmmKeys(pairPK);
//           if (poolKeys) {
//             if (poolKeys.baseMint.toBase58() == WSOL.mint) {
//               mintPK = poolKeys.quoteMint;
//               wsolVault = poolKeys.baseVault;
//               tokenVault = poolKeys.quoteVault;
//             } else {
//               mintPK = poolKeys.baseMint;
//               wsolVault = poolKeys.quoteVault;
//               tokenVault = poolKeys.baseVault;
//             }
//           }
//         }
//       }
//     }

//     if (!mintPK) {
//       return;
//     }
//     const token = await tokenRepository.findOneBy({ mint: mintPK.toBase58() });
//     if (!token) return;
//     const marketCap = await getAmmMarketCap(wsolVault, tokenVault);
//     if (!marketCap) return;

//     pendingTokens.append({
//       mintAddress: mintPK.toBase58(),
//       ammAddress: pairPK.toBase58(),
//       // tokenVault: tokenVault.toBase58(),
//       // wsolVault: wsolVault.toBase58(),
//       marketCap,
//       raydium: true,
//       tokenData: token,
//     });
//     // console.log(`${mintPK.toBase58()} (raydium): ${pendingTokens.size()}`);
//   } catch (e) {
//     console.error("Error:", e);
//   }
// };

const getRaydiumMint2 = async (accountInfo) => {
  const pairPK = accountInfo.accountId;
  const data = accountInfo.accountInfo.data;
  const poolKeys = await getRaydiumAmmKeysWithData(data);
  if (!poolKeys) return;
  let mintPK = undefined;
  let tokenVault = undefined;
  let wsolVault = undefined;
  if (poolKeys.baseMint.toBase58() == WSOL.mint) {
    mintPK = poolKeys.quoteMint;
    wsolVault = poolKeys.baseVault;
    tokenVault = poolKeys.quoteVault;
  } else {
    mintPK = poolKeys.baseMint;
    wsolVault = poolKeys.quoteVault;
    tokenVault = poolKeys.baseVault;
  }
  const token = await tokenRepository.findOneBy({ mint: mintPK.toBase58() });
  if (!token) return;
  const marketCap = await getAmmMarketCap(wsolVault, tokenVault);
  if (!marketCap) return;

  pendingTokens.append({
    mintAddress: mintPK.toBase58(),
    ammAddress: pairPK.toBase58(),
    // tokenVault: tokenVault.toBase58(),
    // wsolVault: wsolVault.toBase58(),
    marketCap,
    raydium: true,
    tokenData: token,
  });
  // console.log(`${mintPK.toBase58()} (raydium): ${pendingTokens.size()}`);
};

const updateNotify = async (mintAddress, _marketCap) => {
  try {
    // await sleep(1000);
    // if (!(await mintRepository.findOneBy({mint: mintAddress })).complete) return;
    let index = -1;
    for (const [idx, mc] of initialMarketCaps.entries()) {
      if (_marketCap > mc) {
        index = idx;
        break;
      }
    }
    if (index < 0) return;

    const tokenData = await tokenRepository.findOneBy({ mint: mintAddress });
    if (!tokenData) return;

    const { mint, multiple, marketCap, symbol } = tokenData;

    const oldMulCount = multiple ?? 1;
    const mulCount = Math.floor(_marketCap / marketCap);
    // console.log(`${mint}, Multiplier: x${mulCount}`);
    if (mulCount > oldMulCount && mulCount % 2 == 0) {
      await tokenRepository.update(mint, { multiple: mulCount });
      const percentage = (mulCount - 1) * 100; // %
      // Make profit message for telegram
      if (_marketCap > 25000){
        const updateMessage = `
        DOTM IDENTIFIED A PRICE INCREASE
        TOKEN - $${symbol} INCREASED BY x${mulCount} 🎯
        TOKEN ID - 
        <code>${mint}</code>
            
        MC: $${formatMarketCap(marketCap)} -> $${formatMarketCap(_marketCap)} (x${mulCount}) 🎯
            
        PERCENTAGE INCREASE - +${percentage}%
            
        `;
        sendTgMsgToUsers(updateMessage, "bot");
      }
    }
  } catch (e) {
    console.error("Error:", e);
  }
};

const newNotify = async (tokenData) => {
  const {
    mint,
    name,
    symbol,
    twitter,
    telegram,
    website,
    owner,
    createdAt,
    devAta,
    aBondingCurve,
    isMint,
    marketCap,
    dexPaid,
  } = tokenData;
  await sleep(500);
  if (marketCap >= 25000){
    const ageSecond = calculateSecond(createdAt);
    const marketCapFormatted = formatMarketCap(marketCap);
    const devBalance = await getSPLTokenBalance(devAta);
    const age = calculateAge(createdAt);
    const tokenBalance = await getSPLTokenBalance(aBondingCurve);
    const bondingCurveProgress = calculateBondingCurveProgress(tokenBalance);

    const devSold = devBalance > 0 ? "🔴" : "🟢";

    const largestAccounts = await connection.getTokenLargestAccounts(
      new PublicKey(mint),
      connection.commitment
    );

    // const highWinRate = largestAccounts.value[0].address;
    const top10HolderPercentage = calculateTop10HolderPercentage(largestAccounts);
    const top20HoldersPercentage =
      calculateTop20HolderPercentage(largestAccounts);

    let socialLinks = "";
    if (twitter) {
      socialLinks += `<a href="${twitter}">twitter</a> | `;
    }
    if (website) {
      socialLinks += `<a href="${website}">website</a> | `;
    }
    if (telegram) {
      socialLinks += `<a href="${telegram}">telegram</a>`;
    }

    const [holders, whales] = await getHolders2(mint);
    let isDexpaid;

    let newMessage = "";
    let index = -1;
    for (const [idx, mc] of initialMarketCaps.entries()) {
      if (marketCap > mc) {
        index = idx;
        break;
      }
    }
    if (index >= 0) {
      // const matchedMC = formatMarketCap(initialMarketCaps[index]);
      newMessage = `<i>30K THRESHOLD MET</i>`;
      // console.log(
      //   `${mint}: MarketCap ${formatMarketCap(marketCap)} > ${matchedMC}`
      // );
    }
    // if (!isMint && index < 0) {
    //   return;
    // }
    let snipers = 0
    try {
      snipers = (await mintRepository.findOneBy({ mint })).snipers;
      await mintRepository.update(mint, { complete: true })
      // .then(() => console.log(`Mint updated complete, ${mint}: Marked as complete`))
      // .catch(e => console.error(`Error updating complete mint, ${mint}: ${e}`))
    } catch { }
    let insiders = "0.00%";
    await fetch(`http://138.201.123.93:5000/?tokenAddress=${mint}`)
      .then(res => res.json())
      .then(res => {
        insiders = res.insider;
        isDexpaid = res.dex_paid;
      })
      .catch(err => console.log({}))
    
    const jeeters = 0;
    const fresh = 0;
  
    newMessage += `
      DOTM ALPHA SIGNAL

        ${name} $${symbol} ${isMint ? "| 🆕 <i>Newly Created Token</i>" : ""}
  
        TOKEN ID & DETAILS:
        <code>${mint}</code>
        Market Cap: $${marketCapFormatted}  - AGE: ${age}

        Owner: 
        <code>${owner}</code>

        bonding Curve Progress: ${Math.floor(bondingCurveProgress)}%
  
        Holders: ${holders} | Top10: ${top10HolderPercentage}% | Top20: ${top20HoldersPercentage}%
  
        Alpha : ${insiders} Snipers: ${snipers} HighWr Wallets: ${whales}
  
        Fresh Wallet Count : ${fresh}
  
        DEV Sold: ${devSold} DEX PAID: ${isDexpaid ? "🟢" : "🔴"}
  
        ${socialLinks ? `Links: ${socialLinks}` : ""}

                                           <a href="https://dexscreener.com/solana/${mint}">DEX</a> | <a href="https://solscan.io/account/${owner}">SOLSCAN</a>
  
        `;
    if (ageSecond < 10){
      sendTgMsgToUsers(newMessage, "bot1");
    }

    if (ageSecond >= 24 * 3600 && ageSecond < 7 * 24 * 3600){
      sendTgMsgToUsers(newMessage, "bot2");
    }

    if (ageSecond > 7 * 24 * 3600){
      sendTgMsgToUsers(newMessage, "bot3");
    }
  }
};

const updateBoostedNofify = async (tokenData) => {
  const updateMessage = `⚡️ DexBOOST DETECTED ⚡️
🚀 ${tokenData.name} - $${tokenData.symbol}
<code>${tokenData.mint}</code>

📣 Sponsored: Promote your token now !`;
  sendTgMsgToUsers(updateMessage, "bot");
};

const updateRaydiumNotify = async (tokenData, mintAddress) => {
  const updateMessage = `⚡️ Raydium Launched ⚡️
  🚀 ${tokenData.name} - $${tokenData.symbol}
  <code>${tokenData.mint}</code>

  📣 Sponsored: Promote your token now !`;
  const token = await tokenRepository.findOneBy({ mint: mintAddress });
  if (!token.raydium){
    sendTgMsgToUsers(updateMessage, "bot");
  }
};

const checkTokenAndGetData = async () => {
  console.log("Checking for new tokens...");
  while (true) {
    try {
      const pendingToken = pendingTokens.peekLeft();
      
      pendingTokens.popLeft();
      const {
        mintAddress,
        bondingCurveAddress,
        associatedBondingCurveAddress,
        isMint,
        marketCap,
        raydium,
        ammAddress,
        tokenData,
        creator,
        created_timestamp
      } = pendingToken;
      if (raydium) {
        if (!tokenData.raydium) {
          updateRaydiumNotify(tokenData, mintAddress);
          await tokenRepository.update(mintAddress, {
            raydium: ammAddress,
          });
          console.log(`Raydium launched updated: ${mintAddress}`);
        }
        updateNotify(mintAddress, marketCap);
      } else {
        const token = await tokenRepository.findOneBy({ mint: mintAddress });
        if (!token) {
          let tokenInfo = undefined;
          if (isMint) {
            tokenInfo = await getMintInfo(new PublicKey(mintAddress))
          } else {
            // tokenInfo = await getTokenInfo(mintAddress);
          }
          if (tokenInfo) {
            const tokenName = tokenInfo.name;
            const tokenSymbol = tokenInfo.symbol;
            const mint = mintAddress;
            const twitter = tokenInfo.twitter ?? "";
            const telegram = tokenInfo.telegram ?? "";
            const website = tokenInfo.website ?? "";
            const owner = tokenInfo.creator ?? creator;
            // const marketCap = tokenInfo.usd_market_cap ?? "";
            const createdAt = Math.floor(
              Number(tokenInfo.created_timestamp ?? created_timestamp) / 1000
            );
            const devAssociatedTokenAccount = getAssociatedTokenAddressSync(
              new PublicKey(mint),
              new PublicKey(owner)
            ).toBase58();

            const isDexpaid = await checkDexPaid(mint);

            const token = {
              mint,
              name: tokenName,
              symbol: tokenSymbol,
              twitter,
              telegram,
              website,
              marketCap,
              owner,
              createdAt,
              devAta: devAssociatedTokenAccount,
              aBondingCurve: associatedBondingCurveAddress,
              bondingCurve: bondingCurveAddress,
              isMint,
              dexPaid: isDexpaid,
            };

            try {
              await tokenRepository.insert(token);
              console.log(`New token inserted: ${mintAddress}`);
              newNotify(token);
            } catch (err) {
              console.error(`Failed to insert token: ${mintAddress}`, err);
            }
          } else {
            // console.error(`Failed to fetch token info for ${mintAddress}`);
          }
        } else {
          updateNotify(mintAddress, marketCap);
        }
      }
    } catch (e) {
      if (!e.toString().includes("Deque is empty")) {
        console.error("Error:", e);
      }
      await sleep(1);
    }
  }
};

const startPumpFunLogsSubscription = async () => {
  const seenSignatures = new Deque(10);
  connection.onLogs(
    new PublicKey(pumpfunManage),
    async (_logs) => {
      const signature = _logs.signature;
      const err = _logs.err;
      const logs = _logs.logs;
      if (err) return;
      if (seenSignatures.contains(signature)) return;
      seenSignatures.append(signature);
      let isTransfer = false;
      let isMint = false;
      for (const log of logs) {
        if (!isTransfer && log.includes("Transfer")) {
          isTransfer = true;
        }
        if (!isMint && log.includes("InitializeMint2")) {
          isMint = true;
        }
        if (isTransfer && isMint) {
          break;
        }
      }
      if (isTransfer || isMint) {
        getPumpMint(signature, isMint, isTransfer);
      }
    },
    "confirmed"
  );
};

// const startRaydiumLogsSubscription = async () => {
//   const seenSignatures = new Deque(10);
//   connection.onLogs(
//     new PublicKey(raydiumAmm),
//     async (_logs) => {
//       const signature = _logs.signature;
//       const err = _logs.err;
//       const logs = _logs.logs;
//       if (err) return;
//       if (seenSignatures.contains(signature)) return;
//       seenSignatures.append(signature);
//       for (const log of logs) {
//         if (log.includes("Transfer")) {
//           getRaydiumMint(signature);
//         }
//       }
//     },
//     "confirmed"
//   );
// };

const startRaydiumLogsSubscription2 = async () => {
  connection.onProgramAccountChange(
    new PublicKey(raydiumAmm),
    async (accountInfo) => {
      getRaydiumMint2(accountInfo);
    }
  );
};

const startTokenLogsSubscription = async () => {
  const seenSignatures = new Deque(10);
  connection.onLogs(
    TOKEN_PROGRAM_ID,
    async (_logs) => {
      const signature = _logs.signature;
      const err = _logs.err;
      const logs = _logs.logs;
      if (err) return;
      if (seenSignatures.contains(signature)) return;
      seenSignatures.append(signature);
      for (const log of logs) {
        if (log.includes("Transfer")) {
        }
      }
    },
    "confirmed"
  );
};


const main = async () => {
  AppDataSource.initialize()
    .then(() => {
      loadUsersFromFile();
      //---------Update SOL Price real time-------
      updateSolPrice();
      //---------Detect Pump.fun Events------------
      startPumpFunLogsSubscription();
      //---------Detect Raydium AMM Events------------
      startRaydiumLogsSubscription2();
      //---------Detect Token Transfer Events------------
      // startTokenLogsSubscription();
      //---------Check Token and Notify------------
      checkTokenAndGetData();
      //---------Check newly boosted tokens------------
      setInterval(async () => {
        const tokens = await getLatestBoostedTokens();
        console.log(`Checking for newly boosted tokens (${tokens.length})...`);
        [...tokens].forEach(async (tokenAddress) => {
          try {
            const tokenData = await tokenRepository.findOneBy({
              mint: tokenAddress,
              dexPaid: false,
            });
            if (tokenData) {
              try {
                await tokenRepository.update(tokenAddress, {
                  dexPaid: true,
                });
                updateBoostedNofify(tokenData);
                console.log(`Dex paid status updated: ${tokenAddress}`);
              } catch (e) {
                console.error(
                  `Error updating dex paid status: ${tokenAddress}`,
                  e
                );
              }
            }
          } catch (e) {
            console.error(`Error fetching token data: ${tokenAddress}`, e);
          }
        });
      }, 1000);
    })
    .catch((error) => {
      console.error("Failed to initialize app data source:", error);
    });
};

main();

