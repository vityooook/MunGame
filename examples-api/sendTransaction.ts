
import { Address, beginCell, internal, toNano, TonClient } from '@ton/ton';
import { HighloadWallet } from "./HighloadWallet";
import { keyPairFromSecretKey } from "@ton/crypto";
import { HighloadQueryId } from './HighloadQueryId';
import dotenv from 'dotenv';
import path from 'path';
import { checkTransactionStatusTonCenter } from './transactionValidator'; // Импортируем функцию

// Загрузка переменных окружения из .env файла
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const secretKeyHex = process.env.SECRET_KEY || ""; // Получаем секретный ключ из переменных окружения

// Инициализация TonApiClient с базовым URL тестовой сети и API ключом
const client = new TonClient({
    endpoint: "https://testnet.toncenter.com/api/v2/jsonRPC",
    apiKey: process.env.TON_API_KEY // you can get an api key from @tonapibot bot in Telegram
});

/**
 * Функция для выполнения основной логики: отправка транзакции и проверка её статуса.
 * @param highloadWalletAddress - Адрес высоконагруженного кошелька.
 * @param sendTo - Адрес получателя.
 * @param jetton - Объект с деталями jetton (адрес и количество).
 */
async function run(
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

        // Подготовка сообщения для отправки Jetton
        const message = internal({
            to: jetton.address,
            value: toNano("0.05"), // TON для комиссии; часть из них вернётся в кошелёк 
            body: beginCell()
                .storeUint(0xf8a7ea5, 32) // Opcode для переноса jetton
                .storeUint(0, 64)
                .storeCoins(BigInt(jetton.amount)) // Количество jetton для переноса USDT = 10**6; TON = 10**9 
                .storeAddress(sendTo) // Адрес получателя
                .storeAddress(highloadWalletAddress) // Адрес для ответа и возврата TON
                .storeBit(0)
                .storeCoins(1) 
                .storeBit(0)
                .endCell()
        });

        // Инициализация обработчика запросов и получение следующего query ID для хранения в базе данных
        const queryHandler = HighloadQueryId.fromShiftAndBitNumber(1002n, 0n).getNext(); // получить из базы данных // Получить следующий shift и bit number. Сохранить в базе данных
        // queryHandler.getBitNumberz()
        // queryHandler.getShift()
        const subwalletId = 0; // ID субкошелька, должно храниться вместе с высоконагруженным кошельком
        const timeout = 12 * 60 * 60; // Таймаут транзакции, также должно храниться
        const createdAt = Math.floor(Date.now() / 1000) - 60; // Время создания транзакции минус буфер задержки

        // Отправка транзакции и получение хеша сообщения для проверки транзакции
        const messageHash = await wallet.sendExternalMessage(
            walletKeyPair.secretKey,
            {
                message: message,
                mode: 3, 
                query_id: queryHandler,
                createdAt: createdAt,
                subwalletId: subwalletId,
                timeout: timeout
            }
        );

        console.log(`Транзакция отправлена. Хеш сообщения: ${messageHash}`);

        // Проверка статуса транзакции
        const status = await checkTransactionStatusTonCenter(
            highloadWalletAddress.toString(),
            messageHash,
            process.env.TON_API_KEY

        );

        if (status) {
            console.log('Транзакция успешно завершена!');
        } else {
            console.log('Процесс завершён с ошибкой.');
            process.exit(1); // Завершение процесса с кодом ошибки
        }
    } catch (error: any) {
        console.error('Ошибка в процессе выполнения:', error.message || error);
        process.exit(1); // Завершение процесса с кодом ошибки
    }
}

// Пример вызова функции с тестовыми адресами и деталями jetton
run(
    Address.parse("0QB6ZOQd5htYtmB1qxWkd3c1iBoowxnMR5Rt61EscxJnIiou"),
    Address.parse("0QAFyfwn13L8oi30vdWBV41zFaHzCa6mJpVEjCeaDUAqmGcO"),
    {
        address: Address.parse("kQBc0K3cZ8o_lU3lW6iplqxREUBOi4yNMGFW_LORwFXmaQDV"),
        amount: 1 * 10 ** 6 // 10**9 = ton or jetton; 10**6 = usdt
    }
);
