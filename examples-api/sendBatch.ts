import { TonApiClient } from "@ton-api/client";
import { Address, beginCell, internal, OutActionSendMsg, SendMode, toNano } from '@ton/core';
import { HighloadWallet } from "./HighloadWallet";
import { sign, keyPairFromSecretKey } from "@ton/crypto";
import { HighloadQueryId } from './HighloadQueryId';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log("SECRET_KEY:", process.env.SECRET_KEY);
const secretKeyHex = process.env.SECRET_KEY || "";

const client = new TonApiClient({
    baseUrl: 'https://testnet.tonapi.io',
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
    const wallet = HighloadWallet.connectWallet(highloadWalletAddress, client);
    const walletKeyPair = keyPairFromSecretKey(Buffer.from(secretKeyHex, 'hex'));

    const actions: OutActionSendMsg[] = [];

    actions.push({
        type: 'sendMsg',
        mode: SendMode.PAY_GAS_SEPARATELY,
        outMsg: internal({
            to: jetton.address,
            value: toNano("0.1"),
            body: beginCell()
                .storeUint(0xf8a7ea5, 32)
                .storeUint(0, 64)
                .storeCoins(BigInt(jetton.amount))
                .storeAddress(sendTo)
                .storeAddress(highloadWalletAddress)
                .storeBit(0)
                .storeCoins(1)
                .storeBit(0)
                .endCell()
        })
    });

    actions.push({
        type: 'sendMsg',
        mode: SendMode.PAY_GAS_SEPARATELY,
        outMsg: internal({
            to: jetton.address,
            value: toNano("0.01"),
            body: beginCell()
                .storeUint(0, 32)
                .storeStringTail("MunGame best team")
                .endCell()
        })
    });

    const queryHandler = HighloadQueryId.fromShiftAndBitNumber(0n, 41n);
    const query = queryHandler.getNext();

    const subwalletId = 0;
    const timeout = 2 * 60 * 60;
    const createdAt = Math.floor(Date.now() / 1000) - 60;

    // Отправляем транзакцию и получаем хэш сообщения
    const messageHash = await wallet.sendBatch(
        walletKeyPair.secretKey,
        actions,
        subwalletId,
        query,
        timeout,
        createdAt
    );

    console.log(`Транзакция отправлена. Хэш сообщения: ${messageHash}`);

    // Проверяем статус транзакции
    checkTransactionStatusTonApi(messageHash)
}

async function checkTransactionStatusTonApi(traceId: string, interval: number = 5000, maxWaitTime: number = 120000): Promise<boolean> {
    const startTime = Date.now();

    // Ждём 10 секунд перед первым запуском
    await new Promise(resolve => setTimeout(resolve, 10000));

    while (Date.now() - startTime < maxWaitTime) {
        try {
            const response = await client.traces.getTrace(traceId);
            const transactionData = response.transaction;

            // Проверяем успешность транзакции
            if (transactionData.success && transactionData.computePhase?.success && transactionData.actionPhase?.success && !transactionData.aborted) {
                console.log('Транзакция успешно проведена.');
                return true;
            } else if (transactionData.aborted) {
                console.log('Транзакция была прервана.');
                return false;
            } else {
                console.log('Транзакция ещё не завершена...');
            }
        } catch (error: any) {
            // Игнорируем ошибку "Invalid magic"
            if (error.message && error.message.includes('Invalid magic')) {
                console.log('Транзакция не найдена. Повторная проверка через несколько секунд...');
            } else {
                console.error('Ошибка при получении статуса транзакции:', error.message || error);
                return false;
            }
        }

        // Ждём заданный интервал перед следующей проверкой
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('Транзакция не подтверждена в течение максимального времени ожидания.');
    return false;
}
run(
    Address.parse("0QBTntndDitJzeAQ2S-lUHu3nB5534-J_1V3RTetWK0etLjz"),
    Address.parse("0QAFyfwn13L8oi30vdWBV41zFaHzCa6mJpVEjCeaDUAqmGcO"),
    {
        address: Address.parse("kQA95AtAgKqGRiClI_T2JL2_DK2h-s2fFx85YukTjRnOl8UI"),
        amount: 1 * 10 ** 6 
    }
);