import { TonApiClient } from "@ton-api/client";
import { Address, beginCell, internal, OutActionSendMsg, SendMode, toNano } from '@ton/core';
import { HighloadWallet } from "./HighloadWallet";
import { keyPairFromSecretKey } from "@ton/crypto";
import { HighloadQueryId } from './HighloadQueryId';
import dotenv from 'dotenv';
import path from 'path';
import { checkTransactionStatusTonApi } from './transactionValidator'; // Импортируем функцию для проверки транзакции

// Загрузка переменных окружения из .env файла
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const secretKeyHex = process.env.SECRET_KEY || ""; // Получаем секретный ключ из переменных окружения

// Инициализация TonApiClient с базовым URL тестовой сети и API ключом
const client = new TonApiClient({
    baseUrl: 'https://testnet.tonapi.io', // если используете mainnet, измените на https://tonapi.io
    apiKey: process.env.TON_API_KEY
});

/**
 * Основная функция для отправки batch транзакций.
 * @param highloadWalletAddress - Адрес высоконагруженного кошелька.
 * @param sendTo - Адрес получателя.
 * @param jetton - Объект с деталями jetton (адрес и количество).
 */
async function runBatch(
    highloadWalletAddress: Address,
    sendTo: Address,
    jetton: {
        address: Address;
        amount: number;
    }
) {
    try {
        // Подключаемся к высоконагруженному кошельку с использованием указанного адреса и API клиента
        const wallet = HighloadWallet.connectWallet(highloadWalletAddress, client);
        const walletKeyPair = keyPairFromSecretKey(Buffer.from(secretKeyHex, 'hex'));

        // Инициализируем массив действий для batch транзакций
        const actions: OutActionSendMsg[] = [];

        // Подготовка действия для отправки Jetton
        actions.push({
            type: 'sendMsg',
            mode: SendMode.PAY_GAS_SEPARATELY, // Отдельная оплата газа
            outMsg: internal({
                to: jetton.address, // Адрес контракта Jetton
                value: toNano("0.05"), // TON для комиссии; часть из них вернётся в кошелёк
                body: beginCell()
                    .storeUint(0xf8a7ea5, 32) // Opcode для переноса jetton
                    .storeUint(0, 64)
                    .storeCoins(BigInt(jetton.amount)) // Количество jetton для переноса
                    .storeAddress(sendTo) // Адрес получателя
                    .storeAddress(highloadWalletAddress) // Адрес для ответа и возврата TON
                    .storeBit(0)
                    .storeCoins(1)
                    .storeBit(0)
                    .endCell()
            })
        });

        // Подготовка действия для отправки TON с комментарием
        actions.push({
            type: 'sendMsg',
            mode: SendMode.PAY_GAS_SEPARATELY, // Отдельная оплата газа
            outMsg: internal({
                to: sendTo, // Адрес получателя для перевода TON
                value: toNano("0.1"), // Сумма перевода в TON
                body: beginCell()
                    .storeUint(0, 32) // Поле opcode (необязательно для комментария)
                    .storeStringTail("1224421422 BUY gift") // Комментарий к переводу
                    .endCell()
            })
        });

        // Инициализация обработчика запросов и получение следующего query ID для хранения в базе данных
        const queryHandler = HighloadQueryId.fromShiftAndBitNumber(0n, 0n).getNext(); // получить из базы данных // Получить следующий shift и bit number. Сохранить в базе данных
        const subwalletId = 0; // ID субкошелька, должно храниться вместе с высоконагруженным кошельком
        const timeout = 12 * 60 * 60; // Таймаут транзакции в секундах
        const createdAt = Math.floor(Date.now() / 1000) - 60; // Время создания транзакции минус буфер задержки

        // Отправка batch транзакции и получение хеша сообщения
        const messageHash = await wallet.sendBatch(
            walletKeyPair.secretKey,
            actions, // Массив действий (batch)
            subwalletId,
            queryHandler,
            timeout,
            createdAt
        );

        console.log(`Batch транзакция отправлена. Хеш сообщения: ${messageHash}`);

        // Проверка статуса транзакции с использованием функции из модуля transactionValidator
        const status = await checkTransactionStatusTonApi(client, messageHash);

        if (status) {
            console.log('Batch транзакция успешно завершена.');
        } else {
            console.log('Batch транзакция завершена с ошибкой.');
            process.exit(1); // Завершение процесса с кодом ошибки
        }
    } catch (error: any) {
        console.error('Ошибка выполнения batch транзакции:', error.message || error);
        process.exit(1); // Завершение процесса с кодом ошибки
    }
}

// Пример вызова функции с тестовыми адресами и деталями jetton
runBatch(
    Address.parse("0QB6ZOQd5htYtmB1qxWkd3c1iBoowxnMR5Rt61EscxJnIiou"),
    Address.parse("0QAFyfwn13L8oi30vdWBV41zFaHzCa6mJpVEjCeaDUAqmGcO"),
    {
        address: Address.parse("kQBc0K3cZ8o_lU3lW6iplqxREUBOi4yNMGFW_LORwFXmaQDV"),
        amount: 1 * 10 ** 6 // Количество jetton в минимальных единицах
    }
);
