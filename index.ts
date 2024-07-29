const express = require("express");
const port = process.env.PORT || 4040;
const axios = require("axios");
const mongoose = require("mongoose");
const { Telegraf } = require("telegraf");
const Token = require("./modals/Token");
const { Connection, PublicKey } = require("@solana/web3.js");
require("dotenv").config();

const app = express();
app.use(express.json());
app.post("*", async (req: any, res: any) => {
  // res.send("hello Post");
  const response = await axios.post(
    "https://api.shyft.to/sol/v1/callback/create"
  );
});
app.get("*", async (req: any, res: any) => {
  res.send("hello Get");
});

const botToken = process.env.TELEGRAM_BOT_KEY;
const mongoUrl = `mongodb+srv://pulumbu11:${process.env.MONGODB_PASSWORD}@cluster0.zkwi0fa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const chatId = process.env.CHAT_ID;
const shyftApiKey = process.env.SHYFT_APIKEY;
const bitqueryApiKey = process.env.BITQUERY_APIKEY;

const bot = new Telegraf(botToken);

mongoose.connect(mongoUrl);

mongoose.connection.on("connected", () => {
  console.log("Connected to MongoDB");
});

function formatAddress(address: string): string {
  if (address.length <= 8) {
    return address; // If the address is already short, no need to format
  }
  const start = address.substring(0, 4);
  const end = address.substring(address.length - 4);
  return `${start}.....${end}`;
}

async function fetchTokenTransactions(tokenAddress: string) {
  const knownExchanges = [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  ];

  const apiUrl = "https://graphql.bitquery.io";
  const query = `
query ($network: SolanaNetwork!, $limit: Int!, $offset: Int!, $from: ISO8601DateTime, $till: ISO8601DateTime, $currency: String!) {
  solana(network: $network) {
    transfers(
      options: {desc: "block.height", limit: $limit, offset: $offset}
      time: {since: $from, till: $till}
      currency: {is: $currency}
      amount: {gt: 0}
    ) {
      block {
        timestamp {
          time(format: "%Y-%m-%d %H:%M:%S")
        }
        height
      }
      sender {
        address
      }
      receiver {
        address
      }
      currency {
        address
        symbol
      }
      amount
      amount_usd: amount(in: USD)
      transaction {
        signature
      }
    }
  }
}
`;
  const variables = {
    network: "solana",
    limit: 2,
    offset: 0,
    from: "2023-01-01T00:00:00Z",
    till: new Date().toISOString(),
    currency: tokenAddress,
  };

  try {
    const response = await axios.post(
      apiUrl,
      {
        query: query,
        variables: variables,
      },
      {
        headers: {
          "x-api-key": bitqueryApiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data && response.data.data) {
      const transactions = response.data.data.solana.transfers;

      if (transactions) {
        const buyTransactions = transactions.filter(
          (tx: any) => !knownExchanges.includes(tx.receiver.address)
        );
        console.log("Transactions:", buyTransactions);
        return buyTransactions;
      } else {
        console.error("No transactions found for the provided token address.");
        return [];
      }
    } else {
      console.error("Unexpected API response structure:", response.data);
      return [];
    }
  } catch (error: any) {
    console.error("Error fetching token transactions:", error.message);
    if (error.code === "ENOTFOUND") {
      console.error(
        "DNS lookup failed. Check your internet connection or DNS settings."
      );
    }
    return [];
  }
}

async function fetchWalletBalance(walletAddress: string) {
  const query = `
  query($walletAddress: String!) {
    solana(network: solana) {
      address(address: {is: $walletAddress}) {
        balance
      }
    }
  }
`;

  const variables = {
    walletAddress: walletAddress,
  };

  const response = await axios.post(
    "https://graphql.bitquery.io",
    {
      query: query,
      variables: variables,
    },
    {
      headers: {
        "X-API-KEY": bitqueryApiKey,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(
    "fetchWalletBalance response:",
    JSON.stringify(response.data, null, 2)
  );

  if (
    response.data &&
    response.data.data &&
    response.data.data.solana &&
    response.data.data.solana.address &&
    response.data.data.solana.address[0]
  ) {
    return response.data.data.solana.address[0].balance;
  } else {
    throw new Error("Unexpected API response structure");
  }
}

// async function fetchTransactionHistory(address: string) {
//   const apiUrl = `https://api.shyft.to/sol/v1/transaction/history?network=minnet&tx_num=1&account=${address}&enable_raw=true`;
//   const maxRetries = 3;
//   let attempt = 0;
//   while (attempt < maxRetries) {
//     try {
//       const response = await axios.get(apiUrl, {
//         headers: {
//           Authorization: `x-api-key: ${shyftApiKey}`,
//         },
//       });

//       if (response.data && response.data.result) {
//         const transactions = response.data.result[0];
//         console.log(transactions);

//         // Filter transactions of type 'SWAP'
//         const swapTransactions = transactions.filter(
//           (tx: any) => tx.type === "SWAP"
//         );

//         return swapTransactions;
//       } else {
//         console.error("Unexpected API response structure");
//         return [];
//       }
//     } catch (error: any) {
//       console.error("Error fetching transaction history:", error.message);
//       if (attempt >= maxRetries - 1) {
//         return [];
//       }
//       attempt++;
//       await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
//     }
//   }
// }

async function isTokenAddressValid(tokenAddress: string) {
  try {
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    );

    console.log(
      "Token validation response:",
      JSON.stringify(response.data, null, 2)
    );

    if (
      response.data &&
      response.data.pairs &&
      response.data.pairs.length > 0
    ) {
      return response.data.pairs;
    } else {
      return false;
    }
  } catch (error: any) {
    console.error("Error validating token address:", error.message);
    return false;
  }
}

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

async function getTokenSupply(tokenMintAddress: any) {
  const tokenMintPublicKey = new PublicKey(tokenMintAddress);
  const tokenSupply = await connection.getTokenSupply(tokenMintPublicKey);
  console.log(`Total supply of the token: ${tokenSupply.value.amount}`);
  return tokenSupply.value.amount;
}

function startBot() {
  let expectingTokenAddress = false;
  let expectingMedia = false;
  let currentTokenAddress = "";
  let currentChatId = null;
  let mediaId = "";

  bot.command("start", (ctx: any) =>
    ctx.replyWithHTML(
      `
      <b>Welcome to the Solana Token Buy Bot! 🚀</b>\n
This bot tracks and alerts you about token purchases on the Solana network.\n
<b>To get started:</b>\n
 1️⃣ Provide the token address of the token you want to monitor.\n
 2️⃣ Simply enter the token address below, and the bot will begin tracking and sending you buy signals for that token.\n\n
   Happy tracking! 🎉
      `
    )
  );

  bot.command("add", async (ctx: any) => {
    const userName = ctx.from.first_name || "user";

    if (ctx.chat.type === "private") {
      ctx.reply("The /add command can only be used in group chats.");
    } else if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
      const memberStatus = await ctx.telegram.getChatMember(
        ctx.chat.id,
        ctx.from.id
      );
      if (
        memberStatus.status === "administrator" ||
        memberStatus.status === "creator"
      ) {
        expectingTokenAddress = true;
        currentChatId = ctx.chat.id;
        ctx.replyWithHTML(
          `<b>Hello ${userName} 👋, Welcome to the Buybot 🤖.</b>\n
It provides blockchain powered trending insights on any token of your choice on Solana 🚀.\n
To get started:\n
✅ Start by sending the token address , e.g., 0x23exhh....
✅ Only Admins can communicate effectively with the bot
✅ Add your preferred image/video(GIF) for reference
          `
        );
      } else {
        ctx.reply("You have to be an Admin to use this command");
      }
    }
  });

  bot.on("text", async (ctx: any) => {
    if (expectingTokenAddress) {
      const tokenAddress = ctx.message.text;
      currentTokenAddress = tokenAddress;

      const isValid = await isTokenAddressValid(tokenAddress);
      if (isValid.length > 0) {
        ctx.replyWithHTML(
          `<b>Congratulations!!!.</b>\n
✅ Token address ${tokenAddress} is valid.\n
Please send an image or video (GIF) to be associated with the alerts.`
        );
        expectingMedia = true;
      } else {
        ctx.reply(
          "Invalid token address. Please provide a valid token address."
        );
      }

      expectingTokenAddress = false;
    }
  });

  bot.on("photo", async (ctx: any) => {
    if (expectingMedia) {
      mediaId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      ctx.reply("Image received. Token tracking will now begin.");
      expectingMedia = false;
      await startTracking(ctx);
    }
  });

  bot.on("video", async (ctx: any) => {
    if (expectingMedia) {
      mediaId = ctx.message.video.file_id;

      ctx.reply("Video received. Token tracking will now begin.");
      expectingMedia = false;
      await startTracking(ctx);
    }
  });

  bot.command("sendtext", async (ctx: any) => {
    bot.telegram.sendPhoto(botToken, mediaId, {
      caption: "text",
      parse_mode: "HTML",
    });
    ctx.reply("success");
  });

  async function startTracking(ctx: any) {
    const transactions = await fetchTokenTransactions(currentTokenAddress);
    const supply = await getTokenSupply(currentTokenAddress);

    bot.telegram.sendPhoto(botToken, mediaId, {
      caption: "text",
      parse_mode: "HTML",
    });

    let telegramImage = `https://api.telegram.org/bot${botToken}/getFile?file_id=${mediaId}`;

    if (transactions.length > 0) {
      let whaleFound = false;
      const isValid = await isTokenAddressValid(currentTokenAddress);
      const tokenData = {
        chat_id: ctx.chat.id,
        chain: isValid[0].chainId,
        token: currentTokenAddress,
        volume: isValid[0].volume.h24,
        buys: transactions,
        photo: telegramImage,
      };
      const token = new Token(tokenData);
      await token.save();
      for (const transaction of transactions) {
        const walletBalance = await fetchWalletBalance(
          transaction.sender.address
        );
        const media = await Token.findOne({ chat_id: ctx.chat.id })
          .select("photo")
          .lean();
        if (walletBalance > 10000) {
          await ctx.replyWithPhoto(
            { source: media.photo },
            {
              caption: `<b>🚨Whale Alert!🚨 </b>
🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋\n
💵 ${transaction.amount + " " + isValid[0].baseToken.symbol} (${
                "$" + transaction.amount_usd
              }) \n
${
  isValid[0].priceUsd * transaction.amount + " " + isValid[0].quoteToken.symbol
}\n
📈New Holder\n
🌐${formatAddress(transaction.sender.address)}\n
📉Market Cap: $${supply * isValid[0].priceUsd}\n
📊Chart ♻️Trade 🚀Trending`,
              parse_mode: "HTML",
            }
          );
          whaleFound = true;
          break;
        } else {
          await ctx.replyWithPhoto(
            { source: mediaId },
            {
              caption: `<b>🚨Buy Alert!🚨 </b>
🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋\n
💵 ${transaction.amount + " " + isValid[0].baseToken.symbol} (${
                "$" + transaction.amount_usd
              }) \n
${
  isValid[0].priceUsd * transaction.amount + " " + isValid[0].quoteToken.symbol
}\n
📈New Holder\n
🌐${formatAddress(transaction.sender.address)}\n
📉Market Cap: $${supply * isValid[0].priceUsd}\n
📊Chart ♻️Trade 🚀Trending`,
              parse_mode: "HTML",
            }
          );
        }
      }
    } else {
      ctx.reply("Error finding transactions");
    }
  }

  //   bot.on("text", async (ctx: any) => {
  //     if (expectingTokenAddress) {
  //       const tokenAddress = ctx.message.text;

  //       const isValid = await isTokenAddressValid(tokenAddress);
  //       if (isValid.length > 0) {
  //         ctx.replyWithHTML(
  //           `<b>Congratulations!!!.</b>\n
  // ✅ Token address ${tokenAddress} is valid.\n`
  //         );

  //         const transactions = await fetchTokenTransactions(tokenAddress);

  //         const supply = await getTokenSupply(tokenAddress);

  //         if (transactions.length > 0) {
  //           let whaleFound = false;
  //           const tokenData = {
  //             chat_id: ctx.chat.id,
  //             chain: isValid[0].chainId,
  //             token: tokenAddress,
  //             volume: isValid[0].volume.h24,
  //             buys: transactions,
  //             photo: isValid[0].info.imageUrl || "",
  //           };
  //           const token = new Token(tokenData);
  //           await token.save();
  //           for (const transaction of transactions) {
  //             const walletBalance = await fetchWalletBalance(
  //               transaction.sender.address
  //             );
  //             if (walletBalance > 10000) {
  //               ctx.replyWithHTML(
  //                 `<b>🚨Whale Alert!🚨 </b>
  // 🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋🐋\n
  // 💵 ${transaction.amount + " " + isValid[0].baseToken.symbol} (${
  //                   "$" + transaction.amount_usd
  //                 }) \n
  // ${
  //   isValid[0].priceUsd * transaction.amount + " " + isValid[0].quoteToken.symbol
  // }\n
  // 📈New Holder\n
  // 🌐${formatAddress(transaction.sender.address)}\n
  // 📉Market Cap: $${supply * isValid[0].priceUsd}\n
  // 📊Chart ♻️Trade 🚀Trending`
  //               );
  //               whaleFound = true;
  //               break;
  //             } else {
  //               ctx.replyWithHTML(
  //                 `<b>🚨Buy Alert!🚨 </b>
  // 🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋🔋\n
  // 💵 ${transaction.amount + " " + isValid[0].baseToken.symbol} (${
  //                   "$" + transaction.amount_usd
  //                 }) \n
  // ${
  //   isValid[0].priceUsd * transaction.amount + " " + isValid[0].quoteToken.symbol
  // }\n
  // 📈New Holder\n
  // 🌐${formatAddress(transaction.sender.address)}\n
  // 📉Market Cap: $${supply * isValid[0].priceUsd}\n
  // 📊Chart ♻️Trade 🚀Trending`
  //               );
  //             }
  //           }
  //         } else {
  //           ctx.reply("Error finding transactions");
  //         }
  //       } else {
  //         ctx.reply(
  //           "Invalid token address. Please provide a valid token address."
  //         );
  //       }

  //       // Reset the flag
  //       expectingTokenAddress = false;
  //     }
  //   });

  // Function to validate the token address (mock implementation)

  bot.launch();
}

startBot();
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));

app.listen(port, (err: any) => {
  if (err) {
    console.log(err);
  }
  console.log("Server listening on port", port);
});
