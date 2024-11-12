import { TonApiClient } from "@ton-api/client";
import { Address, beginCell, internal, OutActionSendMsg, SendMode, toNano } from '@ton/core';
import { HighloadWallet } from "./HighloadWallet";
import { sign, keyPairFromSecretKey } from "@ton/crypto";
import { HighloadQueryId } from './HighloadQueryId';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const secretKeyHex = process.env.SECRET_KEY || ""; // Retrieve the secret key from environment variables

// Initialize the TonApiClient with testnet base URL and API key
const client = new TonApiClient({
    baseUrl: 'https://testnet.tonapi.io', // if using mainnet, change to https://tonapi.io
    apiKey: process.env.TON_API_KEY
});

async function run(
    highloadWalletAddress: Address,
    sendTo: Address,
    jetton: {
        address: Address;
        amount: number;
    }
) {
    // Connect to the highload wallet using the specified address and API client
    const wallet = HighloadWallet.connectWallet(highloadWalletAddress, client);
    const walletKeyPair = keyPairFromSecretKey(Buffer.from(secretKeyHex, 'hex'));

    const actions: OutActionSendMsg[] = []; // Initialize actions array for batch transaction

    // Prepare a jetton transfer message and add to actions array
    actions.push({
        type: 'sendMsg',
        mode: SendMode.PAY_GAS_SEPARATELY, // Pay gas separately from transfer amount
        outMsg: internal({
            to: jetton.address, // Jetton contract address
            value: toNano("0.1"), // TON for commission; part may return to the wallet
            body: beginCell() // Message body
                .storeUint(0xf8a7ea5, 32) // Opcode for jetton transfer
                .storeUint(0, 64)
                .storeCoins(BigInt(jetton.amount)) // Amount of jetton to transfer
                .storeAddress(sendTo) // Recipient address
                .storeAddress(highloadWalletAddress) // Address for response and returning TON
                .storeBit(0)
                .storeCoins(1)
                .storeBit(0)
                .endCell()
        })
    });

    // Prepare a TON transfer message with a comment and add to actions array
    actions.push({
        type: 'sendMsg',
        mode: SendMode.PAY_GAS_SEPARATELY, // Pay gas separately
        outMsg: internal({
            to: sendTo, // Recipient address for TON transfer
            value: toNano("0.01"), // Amount to send in TON
            body: beginCell() // Message body for comments
                .storeUint(0, 32)
                .storeStringTail("1224421422 BUY gift") // Comment message
                .endCell()
        })
    });

    // Initialize query handler and retrieve the next query ID for database storage
    const queryHandler = HighloadQueryId.fromShiftAndBitNumber(1n, 1n);
    const query = queryHandler.getNext(); // Get the next shift and bit number

    const subwalletId = 0; // Subwallet ID, should be stored with highload wallet
    const timeout = 2 * 60 * 60; // Transaction timeout, should also be stored
    const createdAt = Math.floor(Date.now() / 1000) - 60; // Transaction creation time minus delay buffer

    // Send batch transaction and receive the message hash to verify the transaction
    const messageHash = await wallet.sendBatch(
        walletKeyPair.secretKey,
        actions,
        subwalletId,
        query,
        timeout,
        createdAt
    );

    console.log(`Transaction sent. Message hash: ${messageHash}`);

    // Check the transaction status
    checkTransactionStatusTonApi(messageHash)
}

async function checkTransactionStatusTonApi(traceId: string, interval: number = 5000, maxWaitTime: number = 120000): Promise<boolean> {
    const startTime = Date.now();

    // Wait for 10 seconds before the first check
    await new Promise(resolve => setTimeout(resolve, 10000));

    while (Date.now() - startTime < maxWaitTime) {
        try {
            // Fetch the transaction trace from TonAPI
            const response = await client.traces.getTrace(traceId);
            const transactionData = response.transaction;

            // Check if the transaction was successful
            if (transactionData.success && transactionData.computePhase?.success && transactionData.actionPhase?.success && !transactionData.aborted) {
                console.log('Transaction successfully completed.');
                return true;
            } else if (transactionData.aborted) {
                console.log('Transaction was aborted.');
                return false;
            } else {
                console.log('Transaction is still in progress...');
            }
        } catch (error: any) {
            // Ignore "Invalid magic" error
            if (error.message && error.message.includes('Invalid magic')) {
                console.log('Transaction not found. Retrying in a few seconds...');
            } else {
                console.error('Error retrieving transaction status:', error.message || error);
                return false;
            }
        }

        // Wait for the specified interval before the next check
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('Transaction was not confirmed within the maximum wait time.');
    return false;
}

// Example call to run function with test addresses and jetton details
run(
    Address.parse("0QBTntndDitJzeAQ2S-lUHu3nB5534-J_1V3RTetWK0etLjz"),
    Address.parse("0QAFyfwn13L8oi30vdWBV41zFaHzCa6mJpVEjCeaDUAqmGcO"),
    {
        address: Address.parse("kQA95AtAgKqGRiClI_T2JL2_DK2h-s2fFx85YukTjRnOl8UI"),
        amount: 1 * 10 ** 6 // Amount in smallest unit of jetton
    }
);
